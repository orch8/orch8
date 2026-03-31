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
} from "@orch/shared";

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

// API-specific response types
export interface CostSummary {
  total: number;
  byAgent: Array<{
    agentId: string;
    totalCost: number;
    runCount: number;
  }>;
}

export interface CostTimeseriesPoint {
  date: string;
  agentId: string;
  totalCost: number;
  runCount: number;
}

export interface TaskCost {
  total: number;
  runs: Array<{
    id: string;
    agentId: string;
    costUsd: number | null;
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
  }>;
}

export interface PhaseCost {
  total: number;
  byPhase: Array<{
    phase: string;
    totalCost: number;
    runCount: number;
  }>;
}

export interface RunLog {
  log: string;
  store: string;
}

// Kanban column ordering
export const KANBAN_COLUMNS = [
  "backlog",
  "blocked",
  "in_progress",
  "review",
  "verification",
  "done",
] as const;

export type KanbanColumn = (typeof KANBAN_COLUMNS)[number];

// Column display labels
export const COLUMN_LABELS: Record<KanbanColumn, string> = {
  backlog: "Backlog",
  blocked: "Blocked",
  in_progress: "In Progress",
  review: "Review",
  verification: "Verification",
  done: "Done",
};

export interface DaemonStatus {
  status: string;
  pid: number;
  uptimeMs: number;
  uptimeFormatted: string;
  tickIntervalMs: number;
  processCount: number;
  queueDepth: number;
}
