// packages/daemon/src/server.ts
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { spawn as nodeSpawn } from "node:child_process";
import { registerSwagger } from "./api/swagger.js";
import { healthRoutes } from "./api/routes/health.js";
import { taskRoutes } from "./api/routes/tasks.js";
import { commentRoutes } from "./api/routes/comments.js";
import { agentRoutes } from "./api/routes/agents.js";
import { agentInstructionRoutes } from "./api/routes/agent-instructions.js";
import { websocketRoutes } from "./api/websocket.js";
import { authPlugin } from "./api/middleware/auth.js";
import { TaskService } from "./services/task.service.js";
import { TaskLifecycleService } from "./services/task-lifecycle.service.js";
import { AgentService } from "./services/agent.service.js";
import { HeartbeatService } from "./services/heartbeat.service.js";
import { SchedulerService } from "./services/scheduler.service.js";
import { ClaudeLocalAdapter } from "./adapter/claude-local-adapter.js";
import { CodexLocalAdapter } from "./adapter/codex-local/codex-local-adapter.js";
import { SessionManager } from "./adapter/session-manager.js";
import { runRoutes } from "./api/routes/runs.js";
import { identityRoutes } from "./api/routes/identity.js";
import { projectRoutes } from "./api/routes/projects.js";
import { memoryRoutes } from "./api/routes/memory.js";
import { costRoutes } from "./api/routes/cost.js";
import { activityRoutes } from "./api/routes/activity.js";
import { daemonRoutes } from "./api/routes/daemon.js";
import { adapterTestRoutes } from "./api/routes/adapter-test.js";
import { notificationRoutes } from "./api/routes/notifications.js";
import { errorRoutes } from "./api/routes/errors.js";
import { createDbClient } from "./db/client.js";
import { ProjectService } from "./services/project.service.js";
import { MemoryService } from "./services/memory.service.js";
import { CommentService } from "./services/comment.service.js";
import { SummaryService } from "./services/summary.service.js";
import { MemoryExtractionService } from "./services/memory-extraction.service.js";
import { BroadcastService } from "./services/broadcast.service.js";
import { NotificationService } from "./services/notification.service.js";
import { ErrorLoggerService } from "./services/error-logger.service.js";
import { projectSkillRoutes } from "./api/routes/project-skills.js";
import { ProjectSkillService } from "./services/project-skill.service.js";
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
  /**
   * Canonical admin bearer token. Clients must present this value as
   * `Authorization: Bearer <token>` to reach admin-scoped endpoints.
   * Pass `null` to disable admin authentication via the Bearer header;
   * in that case the only admin path is the optional loopback shortcut
   * (config.auth.allow_localhost_admin).
   */
  adminToken?: string | null;
}

export function buildServer(options: ServerOptions = {}) {
  const logLevel = options.config?.orchestrator.log_level
    ?? process.env.LOG_LEVEL
    ?? "info";

  const app = Fastify({
    genReqId: () => `req_${randomUUID()}`,
    logger: {
      level: logLevel,
    },
  });

  app.register(websocket);

  // Register CORS with an explicit allowlist. Fastify 5's default is to
  // accept any Origin, which is unsafe once the daemon binds to a
  // non-loopback interface. In non-production we whitelist the local
  // dashboard dev-server; in production no origin is allowed by default.
  // credentials:false means cookies are never sent cross-origin either way.
  const isDev = (process.env.NODE_ENV ?? "development") !== "production";
  const corsOrigins = isDev ? ["http://localhost:5173"] : [];
  app.register(cors, {
    origin: corsOrigins,
    credentials: false,
  });

  registerSwagger(app);

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });

  // Health check is always available (no auth required)
  app.register(healthRoutes);

  if (options.databaseUrl) {
    const dbClient = createDbClient(options.databaseUrl);
    app.decorate("db", dbClient.db);
    app.addHook("onClose", async () => {
      await dbClient.close();
    });

    // WebSocket broadcast service (owns its own socket registry — see /ws handler)
    const broadcastService = new BroadcastService();
    app.decorate("broadcastService", broadcastService);

    const errorLogger = new ErrorLoggerService(dbClient.db, app.log, broadcastService);
    app.decorate("errorLogger", errorLogger);

    // Core services
    const taskService = new TaskService(dbClient.db);
    app.decorate("taskService", taskService);

    // Pipeline services
    const pipelineTemplateService = new PipelineTemplateService(dbClient.db);
    app.decorate("pipelineTemplateService", pipelineTemplateService);
    const pipelineService = new PipelineService(dbClient.db, pipelineTemplateService);
    app.decorate("pipelineService", pipelineService);

    // Agent service
    const agentService = new AgentService(dbClient.db, broadcastService);
    agentService.setLogger(app.log);
    app.decorate("agentService", agentService);

    // Project skill service
    const projectSkillService = new ProjectSkillService(dbClient.db);
    app.decorate("projectSkillService", projectSkillService);

    // Heartbeat service
    const heartbeatService = new HeartbeatService(dbClient.db, broadcastService);
    const spawnFn = options.spawnFn ?? nodeSpawn;
    const claudeAdapter = new ClaudeLocalAdapter(dbClient.db, spawnFn, projectSkillService);
    const codexAdapter = new CodexLocalAdapter(dbClient.db, spawnFn, projectSkillService);
    const adapters = { claude_local: claudeAdapter, codex_local: codexAdapter };
    app.decorate("adapters", adapters);
    heartbeatService.setAdapters(adapters);
    const sessionMgr = new SessionManager(dbClient.db);
    heartbeatService.setSessionManager(sessionMgr);

    const apiHost = process.env.ORCH_HOST ?? options.config?.api.host ?? "localhost";
    const apiPort = Number(process.env.ORCH_PORT ?? options.config?.api.port ?? 3847);
    heartbeatService.setApiUrl(`http://${apiHost}:${apiPort}`);
    heartbeatService.setLogger(app.log);
    heartbeatService.setErrorLogger(errorLogger);
    heartbeatService.setPipelineService(pipelineService);
    app.decorate("heartbeatService", heartbeatService);

    // Chat service — reuses the adapter, session manager, and broadcast service.
    const chatService = new ChatService(
      dbClient.db,
      adapters,
      sessionMgr,
      broadcastService,
      `http://${apiHost}:${apiPort}`,
      heartbeatService,
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
    schedulerService.setErrorLogger(errorLogger);
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

    // 7b. Reap chat assistant rows stuck in `streaming` from a prior
    // crashed daemon instance. Mirrors reapOrphanedRuns but targets
    // the chat pipeline, which was previously uncovered (issue 2.4).
    chatService.reapOrphanedChatMessages().catch((err) => {
      app.log.error(
        { err },
        "Failed to reap orphaned streaming chat messages on startup",
      );
    });

    // Populate global skills directory and sync all projects.
    //
    // The returned promise is attached to the app as `initPromise`
    // so index.ts can `await` it before `server.listen(...)`. Running
    // this synchronously on the request-serving path was a real
    // race: before the fix, skills copy, per-project sync, and
    // chat-agent provisioning could all be in flight when the first
    // request arrived, producing "agent not found" / "skill missing"
    // on cold-start installs.
    const initPromise = (async () => {
      try {
        await agentService.rehydrateMissingAgentTokens();
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
            await seedingService.reconcileAgentSkills(dbClient.db, project.id);
          } catch (err) {
            app.log.error(
              { err, projectId: project.id },
              "Failed to provision chat agent or reconcile skills for project",
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
    app.decorate("initPromise", initPromise);

    // Comment service
    const commentService = new CommentService(
      dbClient.db,
      heartbeatService,
      broadcastService,
    );
    app.decorate("commentService", commentService);

    // Notification service
    const notificationService = new NotificationService(dbClient.db);
    app.decorate("notificationService", notificationService);
    errorLogger.setNotificationService(notificationService);

    // Lifecycle service
    const lifecycleService = new TaskLifecycleService(dbClient.db, taskService, broadcastService);
    app.decorate("lifecycleService", lifecycleService);

    // Auth middleware + routes that require DB
    app.register(authPlugin, {
      adminToken: options.adminToken ?? null,
      allowLocalhostAdmin: options.config?.auth.allow_localhost_admin ?? false,
    });

    // Enrich request-scoped logger with correlation IDs (spec §14 §2.2)
    app.addHook("onRequest", async (request) => {
      const childBindings: Record<string, string> = { requestId: request.id };
      if (request.agent) {
        childBindings.agentId = request.agent.id;
      }
      if (request.projectId) {
        childBindings.projectId = request.projectId;
      }
      if (request.headers["x-run-id"]) {
        childBindings.runId = request.headers["x-run-id"] as string;
      }
      if (Object.keys(childBindings).length > 0) {
        request.log = request.log.child(childBindings);
      }
    });

    app.setErrorHandler((err, request, reply) => {
      const routeError = err as Error & { code?: string; statusCode?: number };
      const statusCode = routeError.statusCode ?? 500;
      void app.errorLogger.record({
        severity: statusCode >= 500 ? "error" : "warn",
        source: "api",
        code: routeError.code ?? routeError.name ?? "unhandled_route_error",
        message: routeError.message,
        err,
        requestId: request.id,
        httpMethod: request.method,
        httpPath: request.routeOptions.url ?? request.url,
        httpStatus: statusCode,
        projectId: request.projectId,
        agentId: request.agent?.id,
        actorType: request.agent ? "agent" : "admin",
        actorId: request.agent?.id,
      });
      return reply.code(statusCode).send({
        error: routeError.code ?? (statusCode >= 500 ? "internal_error" : "request_error"),
        message: statusCode >= 500 ? "Internal Server Error" : routeError.message,
        requestId: request.id,
      });
    });

    app.setNotFoundHandler((request, reply) => {
      void app.errorLogger.record({
        severity: "warn",
        source: "api",
        code: "route_not_found",
        message: `${request.method} ${request.url}`,
        requestId: request.id,
        httpMethod: request.method,
        httpPath: request.url,
        httpStatus: 404,
        projectId: request.projectId,
        agentId: request.agent?.id,
        actorType: request.agent ? "agent" : "admin",
        actorId: request.agent?.id,
      });
      return reply.code(404).send({ error: "not_found", message: "Route not found", requestId: request.id });
    });

    app.register(taskRoutes);
    app.register(commentRoutes);
    app.register(agentRoutes);
    app.register(agentInstructionRoutes);
    app.register(chatsRoutes);
    app.register(runRoutes);
    app.register(identityRoutes);
    app.register(projectRoutes);
    app.register(memoryRoutes);
    app.register(costRoutes);
    app.register(activityRoutes);
    app.register(daemonRoutes);
    app.register(adapterTestRoutes);
    app.register(notificationRoutes);
    app.register(errorRoutes);
    app.register(projectSkillRoutes);
    app.register(bundledAgentRoutes);
    app.register(pipelineTemplateRoutes);
    app.register(pipelineRoutes);
  }

  app.register(websocketRoutes);

  return app;
}
