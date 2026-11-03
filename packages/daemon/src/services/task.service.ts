import { eq, and, sql } from "drizzle-orm";
import { projects, tasks, taskDependencies, pipelineSteps } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import type { CreateTaskInput, UpdateTask, TaskFilter } from "@orch/shared";

import { lockPipelineAttempt, requireActiveAttempt, PipelineConflict, type PipelineTx } from "./pipeline.service.js";

type Task = typeof tasks.$inferSelect;

// Drizzle's tx callback receives a PgTransaction that shares the same
// fluent builder surface as SchemaDb. Typing the helpers as
// `TxOrDb = Parameters<SchemaDb["transaction"]>[0] extends (tx: infer T) => unknown ? T : never`
// is accurate but awkward; accepting the intersection here keeps the
// call sites readable and lets us pass either the root db or a tx.
type TxOrDb = SchemaDb | Parameters<Parameters<SchemaDb["transaction"]>[0]>[0];

export async function allocateTaskId(db: TxOrDb, projectId: string): Promise<string> {
  const [row] = await db
    .update(projects)
    .set({ nextTaskNumber: sql`${projects.nextTaskNumber} + 1` })
    .where(eq(projects.id, projectId))
    .returning({
      key: projects.key,
      n: sql<number>`${projects.nextTaskNumber} - 1`,
    });

  if (!row) throw new Error("Project not found");
  return `${row.key}-${row.n}`;
}

export class TaskService {
  constructor(private db: SchemaDb) {}

  async create(input: CreateTaskInput): Promise<Task> {
    return this.db.transaction(async (tx) => {
      const values = await this.buildInsertValues(tx, input);
      const [task] = await tx.insert(tasks).values(values).returning();
      return task;
    });
  }

  /**
   * Create a task and attach its initial dependencies atomically.
   *
   * A partial failure in the middle of the dependency loop (e.g. a cycle
   * detected on the second `dependsOn` entry) previously left the task
   * row in the database with only the first dependency wired. Callers
   * then saw an HTTP 409 but had to clean up the dangling row by hand.
   *
   * Wrapping both the insert and the dependency loop in a single
   * `db.transaction` rolls everything back on any error, matching the
   * atomicity guarantees of `chat.service.ts#createChat` and
   * `project-skill.service.ts#delete`.
   */
  async createWithDependencies(
    input: CreateTaskInput,
    dependsOn: string[],
  ): Promise<Task> {
    return this.db.transaction(async (tx) => {
      const values = await this.buildInsertValues(tx, input);
      const [task] = await tx.insert(tasks).values(values).returning();

      for (const depId of dependsOn) {
        await this.addDependencyTx(tx, task.id, depId);
      }

      if (dependsOn.length > 0) {
        // Re-read so the caller sees the potentially flipped column.
        const [refreshed] = await tx.select().from(tasks).where(eq(tasks.id, task.id));
        return refreshed ?? task;
      }

      return task;
    });
  }

  private async buildInsertValues(
    db: TxOrDb,
    input: CreateTaskInput,
  ): Promise<typeof tasks.$inferInsert> {
    const values: typeof tasks.$inferInsert = {
      id: await allocateTaskId(db, input.projectId),
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      taskType: input.taskType,
      priority: input.priority,
      assignee: input.assignee,
    };

    if (input.autoCommit !== undefined) values.autoCommit = input.autoCommit;
    if (input.autoPr !== undefined) values.autoPr = input.autoPr;
    if (input.finishStrategy !== undefined) values.finishStrategy = input.finishStrategy;
    if (input.mcpTools !== undefined) values.mcpTools = input.mcpTools;
    if (input.linkedIssueIds !== undefined) values.linkedIssueIds = input.linkedIssueIds;

    if (input.taskType === "brainstorm") {
      values.brainstormStatus = "active";
    }

    return values;
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
    if (filter.pipelineId) conditions.push(eq(tasks.pipelineId, filter.pipelineId));

    if (conditions.length === 0) {
      return this.db.select().from(tasks);
    }

    return this.db.select().from(tasks).where(and(...conditions));
  }

  private async withTaskLock<T>(taskId: string, operation: (tx: PipelineTx, task: Task) => Promise<T>): Promise<T> {
    return this.db.transaction(async tx => {
      const [hint] = await tx.select().from(tasks).where(eq(tasks.id, taskId));
      if (!hint) throw new Error("Task not found");
      if (hint.pipelineId || hint.pipelineStepId) {
        const state = await lockPipelineAttempt(tx, hint.pipelineId ?? "", hint.pipelineStepId ?? "", taskId);
        requireActiveAttempt(state.pipeline, state.step, state.task);
        return operation(tx, state.task);
      }
      const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).for("update");
      if (!task) throw new Error("Task not found");
      return operation(tx, task);
    });
  }

  async update(id: string, input: UpdateTask): Promise<Task> {
    return this.withTaskLock(id, async (tx, task) => {
      if (task.pipelineId) {
        if (input.column !== undefined) throw new PipelineConflict("Use pipeline lifecycle operations");
        if (input.assignee !== undefined) {
          if (task.executionRunId) throw new PipelineConflict("Cannot reassign an executing pipeline task");
          await tx.update(pipelineSteps).set({ agentId: input.assignee, updatedAt: new Date() })
            .where(eq(pipelineSteps.id, task.pipelineStepId!));
        }
      }
      const [updated] = await tx.update(tasks).set({ ...input, updatedAt: new Date() })
        .where(eq(tasks.id, id)).returning();
      return updated;
    });
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.delete(tasks).where(eq(tasks.id, id)).returning();
    if (result.length === 0) throw new Error("Task not found");
  }

  async addDependency(taskId: string, dependsOnId: string): Promise<void> {
    await this.withTaskLock(taskId, tx => this.addDependencyTx(tx, taskId, dependsOnId));
  }

  private async addDependencyTx(
    db: TxOrDb,
    taskId: string,
    dependsOnId: string,
  ): Promise<void> {
    if (taskId === dependsOnId) {
      throw new Error("A task cannot depend on itself");
    }

    const wouldCycle = await this.wouldCreateCycleTx(db, taskId, dependsOnId);
    if (wouldCycle) {
      throw new Error("Adding this dependency would create a cycle");
    }

    await db.insert(taskDependencies).values({ taskId, dependsOnId });

    // Auto-block: if the dependent task is in backlog, move it to blocked
    // since it now has an unresolved dependency
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (task && task.column === "backlog") {
      await db
        .update(tasks)
        .set({ column: "blocked", updatedAt: new Date() })
        .where(eq(tasks.id, taskId));
    }
  }

  async removeDependency(taskId: string, dependsOnId: string): Promise<void> {
    await this.withTaskLock(taskId, async tx => {
      await tx.delete(taskDependencies).where(and(eq(taskDependencies.taskId, taskId), eq(taskDependencies.dependsOnId, dependsOnId)));
    });
  }

  async convertBrainstorm(taskId: string, newType: "quick"): Promise<Task> {
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
          AND blocked.pipeline_id IS NULL AND blocked.pipeline_step_id IS NULL
        GROUP BY td.task_id
        HAVING bool_and(blocker."column" = 'done')
      )
      UPDATE tasks
      SET "column" = 'backlog', updated_at = now()
      WHERE id IN (SELECT task_id FROM newly_unblockable)
      RETURNING id, title, assignee
    `);
    const unblocked = result as unknown as Array<{ id: string; title: string; assignee: string | null }>;
    const candidates = await this.db.select().from(tasks).where(and(eq(tasks.projectId, projectId), eq(tasks.column, "blocked")));
    for (const candidate of candidates) {
      if (!candidate.pipelineId && !candidate.pipelineStepId) continue;
      try {
        await this.withTaskLock(candidate.id, async (tx, task) => {
          if (task.column !== "blocked") return;
          const resolved = await tx.execute(sql`
            SELECT td.task_id FROM task_dependencies td
            JOIN tasks blocker ON blocker.id = td.depends_on_id
            WHERE td.task_id = ${task.id}
            GROUP BY td.task_id
            HAVING bool_and(blocker."column" = 'done')
          `);
          if (!resolved.length) return;
          await tx.update(tasks).set({ column: "backlog", updatedAt: new Date() }).where(eq(tasks.id, task.id));
          unblocked.push({ id: task.id, title: task.title, assignee: task.assignee });
        });
      } catch (error) {
        if (!(error instanceof PipelineConflict)) throw error;
      }
    }
    return unblocked;
  }

  private async wouldCreateCycleTx(
    db: TxOrDb,
    newTaskId: string,
    newDepId: string,
  ): Promise<boolean> {
    const result = await db.execute(sql`
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
