// packages/daemon/src/server.ts
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { spawn as nodeSpawn } from "node:child_process";
import { registerSwagger } from "./api/swagger.js";
import { healthRoutes } from "./api/routes/health.js";
import { taskRoutes } from "./api/routes/tasks.js";
import { brainstormRoutes } from "./api/routes/brainstorm.js";
import { agentCreatorRoutes } from "./api/routes/agent-creator.js";
import { commentRoutes } from "./api/routes/comments.js";
import { agentRoutes } from "./api/routes/agents.js";
import { websocketRoutes } from "./api/websocket.js";
import { authPlugin } from "./api/middleware/auth.js";
import { BrainstormService } from "./services/brainstorm.service.js";
import { AgentCreatorService } from "./services/agent-creator.service.js";
import { TaskService } from "./services/task.service.js";
import { WorktreeService } from "./services/worktree.service.js";
import { TaskLifecycleService } from "./services/task-lifecycle.service.js";
import { AgentService } from "./services/agent.service.js";
import { HeartbeatService } from "./services/heartbeat.service.js";
import { SchedulerService } from "./services/scheduler.service.js";
import { ClaudeLocalAdapter } from "./adapter/claude-local-adapter.js";
import { SessionManager } from "./adapter/session-manager.js";
import { runRoutes } from "./api/routes/runs.js";
import { identityRoutes } from "./api/routes/identity.js";
import { projectRoutes } from "./api/routes/projects.js";
import { memoryRoutes } from "./api/routes/memory.js";
import { costRoutes } from "./api/routes/cost.js";
import { activityRoutes } from "./api/routes/activity.js";
import { daemonRoutes } from "./api/routes/daemon.js";
import { notificationRoutes } from "./api/routes/notifications.js";
import { createDbClient } from "./db/client.js";
import { ProjectService } from "./services/project.service.js";
import { MemoryService } from "./services/memory.service.js";
import { CommentService } from "./services/comment.service.js";
import { SummaryService } from "./services/summary.service.js";
import { MemoryExtractionService } from "./services/memory-extraction.service.js";
import { BroadcastService } from "./services/broadcast.service.js";
import { NotificationService } from "./services/notification.service.js";
import { projectSkillRoutes } from "./api/routes/project-skills.js";
import { ProjectSkillService } from "./services/project-skill.service.js";
import { instructionBundleRoutes } from "./api/routes/instruction-bundles.js";
import { InstructionBundleService } from "./services/instruction-bundle.service.js";
import { SeedingService } from "./services/seeding.service.js";
import { bundledAgentRoutes } from "./api/routes/bundled-agents.js";
import { PipelineTemplateService } from "./services/pipeline-template.service.js";
import { PipelineService } from "./services/pipeline.service.js";
import { pipelineTemplateRoutes } from "./api/routes/pipeline-templates.js";
import { pipelineRoutes } from "./api/routes/pipelines.js";
import { ChatService } from "./services/chat.service.js";
import { chatsRoutes } from "./api/routes/chats.js";
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

    // Agent creator service
    const agentCreatorService = new AgentCreatorService(dbClient.db, broadcast, spawnFn);
    agentCreatorService.setLogger(app.log);
    app.decorate("agentCreatorService", agentCreatorService);

    // Core services
    const taskService = new TaskService(dbClient.db);
    app.decorate("taskService", taskService);

    // Pipeline services
    const pipelineTemplateService = new PipelineTemplateService(dbClient.db);
    app.decorate("pipelineTemplateService", pipelineTemplateService);
    const pipelineService = new PipelineService(dbClient.db, pipelineTemplateService);
    app.decorate("pipelineService", pipelineService);

    const worktreeService = new WorktreeService();

    // Agent service
    const agentService = new AgentService(dbClient.db, broadcastService);
    app.decorate("agentService", agentService);

    // Project skill service
    const projectSkillService = new ProjectSkillService(dbClient.db);
    app.decorate("projectSkillService", projectSkillService);

    // Instruction bundle service
    const instructionBundleService = new InstructionBundleService(dbClient.db);
    app.decorate("instructionBundleService", instructionBundleService);

    // Heartbeat service
    const heartbeatService = new HeartbeatService(dbClient.db, broadcastService);
    const adapter = new ClaudeLocalAdapter(dbClient.db, spawnFn, projectSkillService, instructionBundleService);
    heartbeatService.setAdapter(adapter);
    const sessionMgr = new SessionManager(dbClient.db);
    heartbeatService.setSessionManager(sessionMgr);

    const apiHost = process.env.ORCH_HOST ?? options.config?.api.host ?? "localhost";
    const apiPort = Number(process.env.ORCH_PORT ?? options.config?.api.port ?? 3847);
    heartbeatService.setApiUrl(`http://${apiHost}:${apiPort}`);
    heartbeatService.setLogger(app.log);
    heartbeatService.setWorktreeService(worktreeService);
    app.decorate("heartbeatService", heartbeatService);

    // Chat service — reuses the adapter, session manager, and broadcast service.
    const chatService = new ChatService(
      dbClient.db,
      adapter,
      sessionMgr,
      broadcastService,
      `http://${apiHost}:${apiPort}`,
    );
    chatService.setLogger(app.log);
    app.decorate("chatService", chatService);

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

    // Seeding service
    const seedingService = new SeedingService();
    app.decorate("seedingService", seedingService);

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

    // Populate global skills directory and sync all projects
    (async () => {
      try {
        await seedingService.populateGlobalSkills();
        app.log.info("Global skills directory populated");

        const allProjects = await projectService.list();
        for (const project of allProjects) {
          await projectSkillService.syncFromDisk(project.id, project.homeDir);
        }
        app.log.info({ count: allProjects.length }, "Synced skills for all projects");

        // Chat-agent backfill: ensure every project has a chat agent.
        let provisionedCount = 0;
        for (const project of allProjects) {
          try {
            const created = await seedingService.provisionChatAgent(
              dbClient.db,
              project.id,
            );
            if (created) provisionedCount++;
            await seedingService.ensureInitialChat(dbClient.db, project.id);
          } catch (err) {
            app.log.error(
              { err, projectId: project.id },
              "Failed to provision chat agent for project",
            );
          }
        }
        app.log.info(
          { scanned: allProjects.length, provisioned: provisionedCount },
          "Chat-agent backfill complete",
        );
      } catch (err) {
        app.log.error({ err }, "Failed to sync global skills on startup");
      }
    })();

    // Comment service
    const commentService = new CommentService(dbClient.db);

    // Notification service
    const notificationService = new NotificationService(dbClient.db);
    app.decorate("notificationService", notificationService);

    // Lifecycle service
    const lifecycleService = new TaskLifecycleService(dbClient.db, taskService, worktreeService, broadcastService);
    app.decorate("lifecycleService", lifecycleService);

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
    app.register(agentCreatorRoutes);
    app.register(commentRoutes);
    app.register(agentRoutes);
    app.register(chatsRoutes);
    app.register(runRoutes);
    app.register(identityRoutes);
    app.register(projectRoutes);
    app.register(memoryRoutes);
    app.register(costRoutes);
    app.register(activityRoutes);
    app.register(daemonRoutes);
    app.register(notificationRoutes);
    app.register(projectSkillRoutes);
    app.register(instructionBundleRoutes);
    app.register(bundledAgentRoutes);
    app.register(pipelineTemplateRoutes);
    app.register(pipelineRoutes);
  }

  app.register(websocketRoutes);

  return app;
}
