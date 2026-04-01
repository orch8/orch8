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
import type { SeedingService } from "./services/seeding.service.js";

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
    memoryService: MemoryService;
    summaryService: SummaryService;
    memoryExtractionService: MemoryExtractionService;
    broadcastService: BroadcastService;
    notificationService: NotificationService;
    projectSkillService: import("./services/project-skill.service.js").ProjectSkillService;
    instructionBundleService: import("./services/instruction-bundle.service.js").InstructionBundleService;
    seedingService: SeedingService;
    pipelineService: import("./services/pipeline.service.js").PipelineService;
    pipelineTemplateService: import("./services/pipeline-template.service.js").PipelineTemplateService;
  }
  interface FastifyRequest {
    agent?: typeof schema.agents.$inferSelect;
    isAdmin?: boolean;
    projectId?: string;
    runId?: string;
  }
}
