import { tasks } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";

type Task = typeof tasks.$inferSelect;

export interface DispatchPlan {
  type: "quick" | "complex" | "brainstorm";
  agentId: string | null;
  phase?: string;
  needsWorktree: boolean;
}

const PHASE_AGENT_FIELD = {
  research: "researchAgentId",
  plan: "planAgentId",
  implement: "implementAgentId",
  review: "reviewAgentId",
} as const;

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

      case "complex":
        return {
          type: "complex",
          agentId: this.resolveComplexAgent(task),
          phase: task.complexPhase ?? undefined,
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

  private resolveComplexAgent(task: Task): string | null {
    if (!task.complexPhase) return task.assignee ?? null;

    const field =
      PHASE_AGENT_FIELD[task.complexPhase as keyof typeof PHASE_AGENT_FIELD];
    const phaseAgent = field ? (task[field] as string | null) : null;

    return phaseAgent ?? task.assignee ?? null;
  }
}
