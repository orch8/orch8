import type {
  projects,
  agents,
  tasks,
  comments,
  heartbeatRuns,
  knowledgeEntities,
  knowledgeFacts,
  activityLog,
  notifications,
  pipelines,
  pipelineSteps,
  pipelineTemplates,
} from "@orch/shared/db";

// Row types inferred from Drizzle schema
export type Project = typeof projects.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Run = typeof heartbeatRuns.$inferSelect;
export type Entity = typeof knowledgeEntities.$inferSelect;
export type Fact = typeof knowledgeFacts.$inferSelect;
export type LogEntry = typeof activityLog.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Pipeline = typeof pipelines.$inferSelect;
export type PipelineStep = typeof pipelineSteps.$inferSelect;
export type PipelineTemplate = typeof pipelineTemplates.$inferSelect;

// API-response shapes + shared UI vocabulary now live in @orch/shared. We
// re-export here so existing dashboard imports (e.g. `from "../types.js"`)
// keep working without churn. Prefer importing from "@orch/shared" in new code.
export {
  KANBAN_COLUMNS,
  COLUMN_LABELS,
  RUN_EVENT_TYPES,
} from "@orch/shared";
export type {
  DaemonStatus,
  CostSummary,
  CostTimeseriesPoint,
  TaskCost,
  RunLog,
  RunEvent,
  RunEventType,
  KanbanColumn,
  PipelineWithSteps,
} from "@orch/shared";
