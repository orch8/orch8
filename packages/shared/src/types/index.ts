import type { z } from "zod";
import type { HealthStatusSchema } from "../schemas/index.js";
import type {
  CreateTaskSchema,
  UpdateTaskSchema,
  ConvertTaskSchema,
  TaskFilterSchema,
  CreateAgentSchema,
  UpdateAgentSchema,
  AgentFilterSchema,
} from "../schemas/index.js";

export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export type CreateTask = z.infer<typeof CreateTaskSchema>;
export type CreateTaskInput = z.input<typeof CreateTaskSchema>;
export type UpdateTask = z.infer<typeof UpdateTaskSchema>;
export type ConvertTask = z.infer<typeof ConvertTaskSchema>;
export type TaskFilter = z.infer<typeof TaskFilterSchema>;

export type { CreateComment, CommentFilter } from "../schemas/comment.js";

export type CreateAgent = z.infer<typeof CreateAgentSchema>;
export type UpdateAgent = z.infer<typeof UpdateAgentSchema>;
export type AgentFilter = z.infer<typeof AgentFilterSchema>;

// Project types
import type {
  CreateProjectSchema,
  UpdateProjectSchema,
  ProjectFilterSchema,
} from "../schemas/index.js";

// z.input lets callers omit fields with zod defaults (description, defaultBranch).
export type CreateProject = z.input<typeof CreateProjectSchema>;
export type UpdateProject = z.infer<typeof UpdateProjectSchema>;
export type ProjectFilter = z.infer<typeof ProjectFilterSchema>;

// Memory types
import type {
  CreateFactSchema,
  EntityFilterSchema,
  KnowledgeSearchSchema,
  WorklogEntrySchema,
  LessonEntrySchema,
} from "../schemas/index.js";

export type CreateFact = z.infer<typeof CreateFactSchema>;
export type EntityFilter = z.infer<typeof EntityFilterSchema>;
export type KnowledgeSearch = z.infer<typeof KnowledgeSearchSchema>;
export type WorklogEntry = z.infer<typeof WorklogEntrySchema>;
export type LessonEntry = z.infer<typeof LessonEntrySchema>;

// Cost types
import type {
  CostSummaryQuerySchema,
  CostTimeseriesQuerySchema,
} from "../schemas/index.js";

export type CostSummaryQuery = z.infer<typeof CostSummaryQuerySchema>;
export type CostTimeseriesQuery = z.infer<typeof CostTimeseriesQuerySchema>;

// Activity types
import type {
  CreateLogEntrySchema,
  LogFilterSchema,
} from "../schemas/index.js";

export type CreateLogEntry = z.infer<typeof CreateLogEntrySchema>;
export type LogFilter = z.infer<typeof LogFilterSchema>;

// Bundled agent types
import type { AddBundledAgentsSchema } from "../schemas/index.js";

export type AddBundledAgents = z.infer<typeof AddBundledAgentsSchema>;

// WebSocket event discriminated union (daemon → dashboard).
export * from "./ws-events.js";

// API-response shapes produced by the daemon. Lived in
// packages/dashboard/src/types.ts before; moved here so daemon + dashboard
// can't silently drift.
export * from "./daemon.js";
export * from "./cost.js";
export * from "./runs.js";
export * from "./pipeline.js";
export * from "./kanban.js";
