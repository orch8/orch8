import { eq, and, sql } from "drizzle-orm";
import { tasks, taskDependencies } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import type { CreateTaskInput, UpdateTask, TaskFilter } from "@orch/shared";

type Task = typeof tasks.$inferSelect;

export class TaskService {
  constructor(private db: SchemaDb) {}

  async create(input: CreateTaskInput): Promise<Task> {
    const values: typeof tasks.$inferInsert = {
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      taskType: input.taskType,
      priority: input.priority,
      assignee: input.assignee,
    };

    if (input.taskType === "complex") {
      values.complexPhase = "research";
      if ("researchAgentId" in input) values.researchAgentId = input.researchAgentId;
      if ("planAgentId" in input) values.planAgentId = input.planAgentId;
      if ("implementAgentId" in input) values.implementAgentId = input.implementAgentId;
      if ("reviewAgentId" in input) values.reviewAgentId = input.reviewAgentId;
      if ("researchPromptOverride" in input) values.researchPromptOverride = input.researchPromptOverride;
      if ("planPromptOverride" in input) values.planPromptOverride = input.planPromptOverride;
      if ("implementPromptOverride" in input) values.implementPromptOverride = input.implementPromptOverride;
      if ("reviewPromptOverride" in input) values.reviewPromptOverride = input.reviewPromptOverride;
    }

    if (input.taskType === "brainstorm") {
      values.brainstormStatus = "active";
    }

    const [task] = await this.db.insert(tasks).values(values).returning();
    return task;
  }

  async getById(id: string): Promise<Task | null> {
    const result = await this.db.select().from(tasks).where(eq(tasks.id, id));
    return result[0] ?? null;
  }

  async list(filter: TaskFilter): Promise<Task[]> {
    const conditions = [];

    if (filter.projectId) conditions.push(eq(tasks.projectId, filter.projectId));
    if (filter.column) conditions.push(eq(tasks.column, filter.column));
    if (filter.taskType) conditions.push(eq(tasks.taskType, filter.taskType));
    if (filter.assignee) conditions.push(eq(tasks.assignee, filter.assignee));
    if (filter.complexPhase) conditions.push(eq(tasks.complexPhase, filter.complexPhase));

    if (conditions.length === 0) {
      return this.db.select().from(tasks);
    }

    return this.db.select().from(tasks).where(and(...conditions));
  }

  async update(id: string, input: UpdateTask): Promise<Task> {
    const [updated] = await this.db
      .update(tasks)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();

    if (!updated) throw new Error("Task not found");
    return updated;
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.delete(tasks).where(eq(tasks.id, id)).returning();
    if (result.length === 0) throw new Error("Task not found");
  }

  async addDependency(taskId: string, dependsOnId: string): Promise<void> {
    if (taskId === dependsOnId) {
      throw new Error("A task cannot depend on itself");
    }

    const wouldCycle = await this.wouldCreateCycle(taskId, dependsOnId);
    if (wouldCycle) {
      throw new Error("Adding this dependency would create a cycle");
    }

    await this.db.insert(taskDependencies).values({ taskId, dependsOnId });
  }

  async removeDependency(taskId: string, dependsOnId: string): Promise<void> {
    await this.db
      .delete(taskDependencies)
      .where(
        and(
          eq(taskDependencies.taskId, taskId),
          eq(taskDependencies.dependsOnId, dependsOnId),
        ),
      );
  }

  async convertBrainstorm(taskId: string, newType: "quick" | "complex"): Promise<Task> {
    const task = await this.getById(taskId);
    if (!task) throw new Error("Task not found");
    if (task.taskType !== "brainstorm") {
      throw new Error("Only brainstorm tasks can be converted");
    }

    const updateValues: Partial<typeof tasks.$inferInsert> = {
      taskType: newType,
      column: "backlog",
      brainstormStatus: null,
      brainstormSessionPid: null,
      updatedAt: new Date(),
    };

    if (newType === "complex") {
      updateValues.complexPhase = "research";
    }

    const [updated] = await this.db
      .update(tasks)
      .set(updateValues)
      .where(eq(tasks.id, taskId))
      .returning();

    return updated;
  }

  async unblockResolved(projectId: string): Promise<Array<{ id: string; title: string; assignee: string | null }>> {
    const result = await this.db.execute(sql`
      WITH newly_unblockable AS (
        SELECT td.task_id
        FROM task_dependencies td
        JOIN tasks blocker ON blocker.id = td.depends_on_id
        JOIN tasks blocked ON blocked.id = td.task_id
        WHERE blocked."column" = 'blocked'
          AND blocked.project_id = ${projectId}
        GROUP BY td.task_id
        HAVING bool_and(blocker."column" = 'done')
      )
      UPDATE tasks
      SET "column" = 'backlog', updated_at = now()
      WHERE id IN (SELECT task_id FROM newly_unblockable)
      RETURNING id, title, assignee
    `);
    return result as unknown as Array<{ id: string; title: string; assignee: string | null }>;
  }

  private async wouldCreateCycle(newTaskId: string, newDepId: string): Promise<boolean> {
    const result = await this.db.execute(sql`
      WITH RECURSIVE dep_chain AS (
        SELECT depends_on_id AS ancestor
        FROM task_dependencies
        WHERE task_id = ${newDepId}
        UNION
        SELECT td.depends_on_id
        FROM task_dependencies td
        JOIN dep_chain dc ON td.task_id = dc.ancestor
      )
      SELECT EXISTS (
        SELECT 1 FROM dep_chain WHERE ancestor = ${newTaskId}
      ) AS would_cycle
    `);
    return (result as unknown as Array<{ would_cycle: boolean }>)[0]?.would_cycle ?? false;
  }
}
