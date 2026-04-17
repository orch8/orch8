import { eq } from "drizzle-orm";
import { tasks } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import { isValidTransition, type TaskColumn } from "./task-transitions.js";
import { TaskService } from "./task.service.js";
import type { BroadcastService } from "./broadcast.service.js";

type Task = typeof tasks.$inferSelect;

export interface TransitionOpts {
  agentId?: string;
  runId?: string;
}

export class TaskLifecycleService {
  constructor(
    private db: SchemaDb,
    private taskService: TaskService,
    private broadcastService?: BroadcastService,
  ) {}

  async transition(
    taskId: string,
    to: TaskColumn,
    opts?: TransitionOpts,
  ): Promise<Task> {
    const task = await this.taskService.getById(taskId);
    if (!task) throw new Error("Task not found");

    const from = task.column as TaskColumn;
    if (!isValidTransition(from, to)) {
      throw new Error(`Invalid transition: ${from} → ${to}`);
    }

    const updateValues: Record<string, unknown> = {
      column: to,
      updatedAt: new Date(),
    };

    if (to === "in_progress") {
      if (!opts?.agentId || !opts?.runId) {
        throw new Error("agentId and runId are required when moving to in_progress");
      }
      updateValues.executionAgentId = opts.agentId;
      updateValues.executionRunId = opts.runId;
      updateValues.executionLockedAt = new Date();
    }

    if (to === "blocked") {
      updateValues.executionAgentId = null;
      updateValues.executionRunId = null;
      updateValues.executionLockedAt = null;
    }

    if (to === "done") {
      updateValues.executionAgentId = null;
      updateValues.executionRunId = null;
      updateValues.executionLockedAt = null;
    }

    const [updated] = await this.db
      .update(tasks)
      .set(updateValues)
      .where(eq(tasks.id, taskId))
      .returning();

    this.broadcastService?.taskTransitioned(task.projectId, {
      taskId,
      from,
      to,
      agentId: opts?.agentId,
    });

    if (to === "done") {
      await this.taskService.unblockResolved(task.projectId);
    }

    return updated;
  }

  async checkout(
    taskId: string,
    agentId: string,
    runId: string,
  ): Promise<Task> {
    const task = await this.taskService.getById(taskId);
    if (!task) throw new Error("Task not found");

    if (task.executionAgentId === agentId) {
      return task;
    }

    if (task.executionAgentId) {
      throw new Error(`Checkout conflict: locked by ${task.executionAgentId}`);
    }

    if (task.column === "done") {
      throw new Error("Cannot checkout completed task");
    }

    if (task.column !== "in_progress") {
      return this.transition(taskId, "in_progress", { agentId, runId });
    }

    const [updated] = await this.db
      .update(tasks)
      .set({
        executionAgentId: agentId,
        executionRunId: runId,
        executionLockedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))
      .returning();

    return updated;
  }

  async release(taskId: string, agentId: string): Promise<Task> {
    const task = await this.taskService.getById(taskId);
    if (!task) throw new Error("Task not found");

    if (task.executionAgentId !== agentId) {
      throw new Error("Agent does not hold execution lock");
    }

    const [updated] = await this.db
      .update(tasks)
      .set({
        executionAgentId: null,
        executionRunId: null,
        executionLockedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))
      .returning();

    return updated;
  }
}
