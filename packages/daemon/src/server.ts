// packages/daemon/src/server.ts
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { spawn as nodeSpawn } from "node:child_process";
import { registerSwagger } from "./api/swagger.js";
import { healthRoutes } from "./api/routes/health.js";
import { taskRoutes } from "./api/routes/tasks.js";
import { brainstormRoutes } from "./api/routes/brainstorm.js";
import { commentRoutes } from "./api/routes/comments.js";
import { agentRoutes } from "./api/routes/agents.js";
import { websocketRoutes } from "./api/websocket.js";
import { authPlugin } from "./api/middleware/auth.js";
import { BrainstormService } from "./services/brainstorm.service.js";
import { TaskService } from "./services/task.service.js";
import { WorktreeService } from "./services/worktree.service.js";
import { TaskLifecycleService } from "./services/task-lifecycle.service.js";
import { AgentService } from "./services/agent.service.js";
import { HeartbeatService } from "./services/heartbeat.service.js";
import { SchedulerService } from "./services/scheduler.service.js";
import { ClaudeLocalAdapter } from "./adapter/claude-local-adapter.js";
import { runRoutes } from "./api/routes/runs.js";
import { identityRoutes } from "./api/routes/identity.js";
import { projectRoutes } from "./api/routes/projects.js";
import { memoryRoutes } from "./api/routes/memory.js";
import { costRoutes } from "./api/routes/cost.js";
import { activityRoutes } from "./api/routes/activity.js";
import { verificationRoutes } from "./api/routes/verification.js";
import { daemonRoutes } from "./api/routes/daemon.js";
import { notificationRoutes } from "./api/routes/notifications.js";
import { createDbClient } from "./db/client.js";
import { ProjectService } from "./services/project.service.js";
import { MemoryService } from "./services/memory.service.js";
import { CommentService } from "./services/comment.service.js";
import { VerificationService } from "./services/verification.service.js";
import { SummaryService } from "./services/summary.service.js";
import { MemoryExtractionService } from "./services/memory-extraction.service.js";
import { BroadcastService } from "./services/broadcast.service.js";
import { NotificationService } from "./services/notification.service.js";
import type { GlobalConfig } from "./config/schema.js";
import "./types.js";

export interface ServerOptions {
  databaseUrl?: string;
  spawnFn?: typeof nodeSpawn;
  config?: GlobalConfig;
}

export function buildServer(options: ServerOptions = {}) {
  const logLevel = options.config?.orchestrator.log_level
    ?? process.env.LOG_LEVEL
    ?? "info";

  const app = Fastify({
    logger: {
      level: logLevel,
    },
  });

  app.register(websocket);
  registerSwagger(app);

  // Health check is always available (no auth required)
  app.register(healthRoutes);

  if (options.databaseUrl) {
    const dbClient = createDbClient(options.databaseUrl);
    app.decorate("db", dbClient.db);
    app.addHook("onClose", async () => {
      await dbClient.close();
    });

    // WebSocket broadcast service
    const connectedSockets = new Set<import("ws").WebSocket>();
    const broadcastService = new BroadcastService(connectedSockets);
    app.decorate("connectedSockets", connectedSockets);
    app.decorate("broadcastService", broadcastService);

    // Backward-compat raw broadcast for services that still use it
    function broadcast(projectId: string, message: unknown) {
      broadcastService.raw(projectId, message);
    }

    // Brainstorm service
    const spawnFn = options.spawnFn ?? nodeSpawn;
    const brainstormService = new BrainstormService(dbClient.db, broadcast, spawnFn);
    brainstormService.setLogger(app.log);
    app.decorate("brainstormService", brainstormService);

    // Core services
    const taskService = new TaskService(dbClient.db);
    app.decorate("taskService", taskService);
    const worktreeService = new WorktreeService();

    // Agent service
    const agentService = new AgentService(dbClient.db, broadcastService);
    app.decorate("agentService", agentService);

    // Heartbeat service
    const heartbeatService = new HeartbeatService(dbClient.db, broadcastService);
    const adapter = new ClaudeLocalAdapter(dbClient.db, spawnFn);
    heartbeatService.setAdapter(adapter);

    heartbeatService.setLogger(app.log);
    heartbeatService.setWorktreeService(worktreeService);
    app.decorate("heartbeatService", heartbeatService);

    // Scheduler service
    const schedulerService = new SchedulerService(dbClient.db, heartbeatService, {
      intervalMs: options.config?.orchestrator.tick_interval_ms
        ?? Number(process.env.ORCH_SCHEDULER_INTERVAL_MS ?? 60_000),
      stalenessThresholdMs: (options.config?.orphan_detection.staleness_threshold_sec ?? 300) * 1000,
    });
    schedulerService.setLogger(app.log);
    app.decorate("schedulerService", schedulerService);

    app.addHook("onClose", async () => {
      schedulerService.stop();
      heartbeatService.shutdown();
    });

    // Project service
    const projectService = new ProjectService(dbClient.db);
    app.decorate("projectService", projectService);

    // Memory service
    const memoryService = new MemoryService(dbClient.db);
    app.decorate("memoryService", memoryService);

    // Summary service
    const summaryService = new SummaryService(dbClient.db, memoryService);
    app.decorate("summaryService", summaryService);

    // Memory extraction service
    const memoryExtractionService = new MemoryExtractionService(dbClient.db, memoryService);
    app.decorate("memoryExtractionService", memoryExtractionService);
    heartbeatService.setExtractionService(memoryExtractionService);

    // Start scheduler (after summary service so regeneration timer can be set)
    schedulerService.setSummaryService(summaryService);

    // Wire TaskService into scheduler for unblockResolved
    schedulerService.setTaskService(taskService);

    schedulerService.start();

    // 7. Resume interrupted tasks from prior daemon instance
    schedulerService.resumeInterruptedRuns().catch((err) => {
      app.log.error({ err }, "Failed to resume interrupted runs on startup");
    });

    // Comment service
    const commentService = new CommentService(dbClient.db);

    // Notification service
    const notificationService = new NotificationService(dbClient.db);
    app.decorate("notificationService", notificationService);

    // Verification service
    const verificationService = new VerificationService(
      dbClient.db,
      commentService,
      async (agentId, projectId, taskId, reason) => {
        await heartbeatService.enqueueWakeup(agentId, projectId, {
          source: "automation",
          taskId,
          reason,
        });
      },
    );
    app.decorate("verificationService", verificationService);

    // Lifecycle service (must come after agentService and verificationService)
    const lifecycleService = new TaskLifecycleService(dbClient.db, taskService, worktreeService, {
      onReview: async (taskId: string, projectId: string) => {
        const allAgents = await agentService.list({ projectId });
        const verifier = allAgents.find((a) => a.role === "verifier");
        if (verifier) {
          await verificationService.spawnVerifier(taskId, verifier.id);
        }
      },
    }, broadcastService);
    app.decorate("lifecycleService", lifecycleService);

    // Wire run completion → lifecycle transition
    heartbeatService.setOnRunCompleted(async (taskId, status) => {
      if (status === "succeeded") {
        try {
          await lifecycleService.transition(taskId, "review");
        } catch (err) {
          app.log.error({ err, taskId, status }, "Failed to transition task after run completion");
        }
      }
    });

    // Auth middleware + routes that require DB
    app.register(authPlugin);

    // Enrich request-scoped logger with correlation IDs (spec §14 §2.2)
    app.addHook("onRequest", async (request) => {
      const childBindings: Record<string, string> = {};
      if (request.headers["x-agent-id"]) {
        childBindings.agentId = request.headers["x-agent-id"] as string;
      }
      if (request.headers["x-project-id"]) {
        childBindings.projectId = request.headers["x-project-id"] as string;
      }
      if (request.headers["x-run-id"]) {
        childBindings.runId = request.headers["x-run-id"] as string;
      }
      if (Object.keys(childBindings).length > 0) {
        request.log = request.log.child(childBindings);
      }
    });

    app.register(taskRoutes);
    app.register(brainstormRoutes);
    app.register(commentRoutes);
    app.register(agentRoutes);
    app.register(runRoutes);
    app.register(identityRoutes);
    app.register(projectRoutes);
    app.register(memoryRoutes);
    app.register(costRoutes);
    app.register(activityRoutes);
    app.register(verificationRoutes);
    app.register(daemonRoutes);
    app.register(notificationRoutes);
  }

  app.register(websocketRoutes);

  return app;
}
