/**
 * Kanban column ordering + display labels. Moved from the dashboard so the
 * daemon (and any future API client) can share the same column vocabulary
 * without duplicating the tuple.
 */

export const KANBAN_COLUMNS = [
  "backlog",
  "blocked",
  "in_progress",
  "done",
] as const;

export type KanbanColumn = (typeof KANBAN_COLUMNS)[number];

export const COLUMN_LABELS: Record<KanbanColumn, string> = {
  backlog: "Backlog",
  blocked: "Blocked",
  in_progress: "In Progress",
  done: "Done",
};
