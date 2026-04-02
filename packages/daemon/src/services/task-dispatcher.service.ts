import { tasks } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";

type Task = typeof tasks.$inferSelect;

export interface DispatchPlan {
  type: "quick" | "brainstorm";
  agentId: string | null;
  needsWorktree: boolean;
}

export class TaskDispatcher {
  constructor(private db: SchemaDb) {}

  async plan(task: Task): Promise<DispatchPlan> {
    switch (task.taskType) {
      case "quick":
        return {
          type: "quick",
          agentId: task.assignee ?? null,
          needsWorktree: true,
        };

      case "brainstorm":
        return {
          type: "brainstorm",
          agentId: task.assignee ?? null,
          needsWorktree: false,
        };

      default:
        throw new Error(`Unknown task type: ${task.taskType}`);
    }
  }
}
