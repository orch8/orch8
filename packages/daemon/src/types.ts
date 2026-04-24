// packages/daemon/src/types.ts
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@orch/shared/db";
import type { TaskLifecycleService } from "./services/task-lifecycle.service.js";
import type { AgentService } from "./services/agent.service.js";
import type { HeartbeatService } from "./services/heartbeat.service.js";
import type { SchedulerService } from "./services/scheduler.service.js";
import type { ProjectService } from "./services/project.service.js";
import type { MemoryService } from "./services/memory.service.js";
import type { SummaryService } from "./services/summary.service.js";
import type { MemoryExtractionService } from "./services/memory-extraction.service.js";
import type { BroadcastService } from "./services/broadcast.service.js";
import type { NotificationService } from "./services/notification.service.js";
import type { ErrorLoggerService } from "./services/error-logger.service.js";
import type { SeedingService } from "./services/seeding.service.js";
import type { AdapterMap } from "./adapter/registry.js";
import type { CommentService } from "./services/comment.service.js";

export type SchemaDb = PostgresJsDatabase<typeof schema>;

declare module "fastify" {
  interface FastifyInstance {
    db: SchemaDb;
    taskService: import("./services/task.service.js").TaskService;
    lifecycleService: TaskLifecycleService;
    agentService: AgentService;
    heartbeatService: HeartbeatService;
    schedulerService: SchedulerService;
    projectService: ProjectService;
    commentService: CommentService;
    memoryService: MemoryService;
    summaryService: SummaryService;
    memoryExtractionService: MemoryExtractionService;
    broadcastService: BroadcastService;
    notificationService: NotificationService;
    errorLogger: ErrorLoggerService;
    projectSkillService: import("./services/project-skill.service.js").ProjectSkillService;
    seedingService: SeedingService;
    pipelineService: import("./services/pipeline.service.js").PipelineService;
    pipelineTemplateService: import("./services/pipeline-template.service.js").PipelineTemplateService;
    chatService: import("./services/chat.service.js").ChatService;
    adapters: AdapterMap;
    /**
     * Resolves once cold-start initialization (global skills populate,
     * per-project skill sync, chat-agent backfill) has finished. The
     * entrypoint awaits this before calling `listen` so the first
     * incoming request always sees a fully provisioned daemon. Tests
     * and lightweight `buildServer({})` callers that skip the DB path
     * will not have this property, hence the optional marker.
     */
    initPromise?: Promise<void>;
  }
  interface FastifyRequest {
    agent?: typeof schema.agents.$inferSelect;
    isAdmin?: boolean;
    projectId?: string;
    runId?: string;
  }
}
