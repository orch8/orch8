import { eq, and } from "drizzle-orm";
import { tasks, agents } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";

type Task = typeof tasks.$inferSelect;
type Agent = typeof agents.$inferSelect;
type ComplexPhase = "research" | "plan" | "implement" | "review";

const PHASE_ORDER: ComplexPhase[] = ["research", "plan", "implement", "review"];

const PHASE_OUTPUT_FIELD = {
  research: "researchOutput",
  plan: "planOutput",
  implement: "implementationOutput",
  review: "reviewOutput",
} as const;

const PHASE_AGENT_FIELD = {
  research: "researchAgentId",
  plan: "planAgentId",
  implement: "implementAgentId",
  review: "reviewAgentId",
} as const;

export class ComplexPhaseService {
  constructor(private db: SchemaDb) {}

  async completePhase(
    taskId: string,
    output: string,
  ): Promise<{ task: Task; nextPhase: ComplexPhase | null }> {
    const [task] = await this.db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) throw new Error("Task not found");
    if (task.taskType !== "complex") throw new Error("Task is not a complex task");
    if (!task.complexPhase) throw new Error("Task has no active phase");

    const currentPhase = task.complexPhase as ComplexPhase;
    const outputField = PHASE_OUTPUT_FIELD[currentPhase];
    const currentIndex = PHASE_ORDER.indexOf(currentPhase);
    const nextPhase = currentIndex < PHASE_ORDER.length - 1
      ? PHASE_ORDER[currentIndex + 1]
      : null;

    const updateValues: Record<string, unknown> = {
      [outputField]: output,
      updatedAt: new Date(),
    };

    if (nextPhase) {
      updateValues.complexPhase = nextPhase;
    } else {
      // Final phase complete — move task to done column
      updateValues.column = "done";
    }

    const [updated] = await this.db
      .update(tasks)
      .set(updateValues)
      .where(eq(tasks.id, taskId))
      .returning();

    return { task: updated, nextPhase };
  }

  async getPhaseAgent(task: Task, phase: ComplexPhase): Promise<Agent | null> {
    const agentField = PHASE_AGENT_FIELD[phase];
    const agentId = task[agentField];

    if (!agentId) return null;

    const result = await this.db
      .select()
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.projectId, task.projectId)));

    return result[0] ?? null;
  }

  getPhaseContext(task: Task, phase: ComplexPhase): string {
    const sections: string[] = [];

    if (phase === "research") {
      return "";
    }

    if (task.researchOutput) {
      sections.push(`## Research Output\n\n${task.researchOutput}`);
    }

    if ((phase === "implement" || phase === "review") && task.planOutput) {
      sections.push(`## Plan Output\n\n${task.planOutput}`);
    }

    if (phase === "review" && task.implementationOutput) {
      sections.push(`## Implementation Output\n\n${task.implementationOutput}`);
    }

    return sections.join("\n\n---\n\n");
  }
}
