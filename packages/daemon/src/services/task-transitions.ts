export type TaskColumn =
  | "backlog"
  | "blocked"
  | "in_progress"
  | "done";

export const VALID_TRANSITIONS: Record<TaskColumn, TaskColumn[]> = {
  backlog: ["blocked", "in_progress"],
  blocked: ["backlog", "in_progress"],
  in_progress: ["blocked", "done"],
  done: [],
};

export function isValidTransition(from: TaskColumn, to: TaskColumn): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getValidTargets(from: TaskColumn): TaskColumn[] {
  return VALID_TRANSITIONS[from] ?? [];
}
