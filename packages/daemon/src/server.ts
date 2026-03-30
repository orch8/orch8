// packages/daemon/src/server.ts
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { spawn as nodeSpawn } from "node:child_process";
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
import { createDbClient } from "./db/client.js";
import { ProjectService } from "./services/project.service.js";
import { MemoryService } from "./services/memory.service.js";
import { CommentService } from "./services/comment.service.js";
import { VerificationService } from "./services/verification.service.js";
import { SummaryService } from "./services/summary.service.js";
import "./types.js";

export interface ServerOptions {
  databaseUrl?: string;
  spawnFn?: typeof nodeSpawn;
}

export function buildServer(options: ServerOptions = {}) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  app.register(websocket);

  // Health check is always available (no auth required)
  app.register(healthRoutes);

  if (options.databaseUrl) {
    const dbClient = createDbClient(options.databaseUrl);
    app.decorate("db", dbClient.db);
    app.addHook("onClose", async () => {
      await dbClient.close();
    });

    // WebSocket broadcast helper
    const connectedSockets = new Set<import("ws").WebSocket>();
    function broadcast(_projectId: string, message: unknown) {
      const data = JSON.stringify(message);
      for (const socket of connectedSockets) {
        if (socket.readyState === 1) {
          socket.send(data);
        }
      }
    }
    app.decorate("connectedSockets", connectedSockets);
    app.decorate("broadcast", broadcast);

    // Brainstorm service
    const spawnFn = options.spawnFn ?? nodeSpawn;
    const brainstormService = new BrainstormService(dbClient.db, broadcast, spawnFn);
    app.decorate("brainstormService", brainstormService);

    // Core services
    const taskService = new TaskService(dbClient.db);
    const worktreeService = new WorktreeService();

    // Agent service
    const agentService = new AgentService(dbClient.db);
    app.decorate("agentService", agentService);

    // Heartbeat service
    const heartbeatService = new HeartbeatService(dbClient.db, broadcast);
    const adapter = new ClaudeLocalAdapter(dbClient.db, spawnFn);
    heartbeatService.setAdapter(adapter);
    app.decorate("heartbeatService", heartbeatService);

    // Scheduler service
    const schedulerService = new SchedulerService(dbClient.db, heartbeatService, {
      intervalMs: Number(process.env.ORCH_SCHEDULER_INTERVAL_MS ?? 60_000),
      stalenessThresholdMs: Number(process.env.ORCH_STALENESS_THRESHOLD_MS ?? 5 * 60 * 1000),
    });
    app.decorate("schedulerService", schedulerService);

    // Start scheduler
    schedulerService.start();
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

    // Comment service
    const commentService = new CommentService(dbClient.db);

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
    });
    app.decorate("lifecycleService", lifecycleService);

    // Auth middleware + routes that require DB
    app.register(authPlugin);
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
  }

  app.register(websocketRoutes);

  return app;
}
