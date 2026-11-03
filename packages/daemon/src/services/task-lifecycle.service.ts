import { eq } from "drizzle-orm";
import { heartbeatRuns, tasks } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import { isValidTransition, type TaskColumn } from "./task-transitions.js";
import { TaskService } from "./task.service.js";
import type { BroadcastService } from "./broadcast.service.js";

import { lockPipelineAttempt, requireActiveAttempt, PipelineConflict } from "./pipeline.service.js";

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

    if (task.pipelineId || task.pipelineStepId) {
      if (to === "in_progress") return this.checkout(taskId, opts?.agentId ?? "", opts?.runId ?? "");
      if (to === "done") throw new PipelineConflict("Use pipeline completion with output");
      const result = await this.db.transaction(async tx => {
        const state = await lockPipelineAttempt(tx, task.pipelineId ?? "", task.pipelineStepId ?? "", taskId);
        requireActiveAttempt(state.pipeline, state.step, state.task);
        if (!isValidTransition(state.task.column as TaskColumn, to)) {
          throw new PipelineConflict(`Invalid transition: ${state.task.column} → ${to}`);
        }
        if (state.task.executionRunId && (state.task.executionRunId !== opts?.runId || state.task.executionAgentId !== opts?.agentId)) {
          throw new PipelineConflict("Transition requires exact execution owner");
        }
        const [updated] = await tx.update(tasks).set({ column: to, executionRunId: null,
          executionAgentId: null, executionLockedAt: null, updatedAt: new Date() })
          .where(eq(tasks.id, taskId)).returning();
        return { updated, from: state.task.column };
      });
      this.broadcastService?.taskTransitioned(result.updated.projectId, {
        taskId, from: result.from, to, agentId: opts?.agentId,
      });
      return result.updated;
    }

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

    if (task.pipelineId || task.pipelineStepId) {
      const result = await this.db.transaction(async tx => {
        const state = await lockPipelineAttempt(tx, task.pipelineId ?? "", task.pipelineStepId ?? "", taskId);
        requireActiveAttempt(state.pipeline, state.step, state.task);
        if (state.task.column === "blocked") throw new PipelineConflict("Task is blocked");
        const [run] = await tx.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, runId)).for("update");
        if (!run || run.status !== "running" || run.projectId !== task.projectId ||
            run.taskId !== taskId || run.agentId !== agentId || state.task.assignee !== agentId) {
          throw new PipelineConflict("Checkout requires the exact running task run");
        }
        if (state.task.executionRunId && (state.task.executionRunId !== runId || state.task.executionAgentId !== agentId)) {
          throw new PipelineConflict("Checkout conflict: another run owns task");
        }
        if (state.task.executionRunId === runId) return { updated: state.task, from: state.task.column };
        const [updated] = await tx.update(tasks).set({ column: "in_progress", executionAgentId: agentId,
          executionRunId: runId, executionLockedAt: new Date(), updatedAt: new Date() })
          .where(eq(tasks.id, taskId)).returning();
        return { updated, from: state.task.column };
      });
      if (result.from !== result.updated.column) this.broadcastService?.taskTransitioned(result.updated.projectId, {
        taskId, from: result.from, to: result.updated.column, agentId,
      });
      return result.updated;
    }
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

  async release(taskId: string, agentId: string, runId?: string): Promise<Task> {
    const task = await this.taskService.getById(taskId);
    if (!task) throw new Error("Task not found");

    if (task.pipelineId || task.pipelineStepId) {
      return this.db.transaction(async tx => {
        const state = await lockPipelineAttempt(tx, task.pipelineId ?? "", task.pipelineStepId ?? "", taskId);
        requireActiveAttempt(state.pipeline, state.step, state.task);
        if (!runId || state.task.executionRunId !== runId || state.task.executionAgentId !== agentId) {
          throw new PipelineConflict("Release requires exact execution owner");
        }
        const [updated] = await tx.update(tasks).set({ executionAgentId: null, executionRunId: null,
          executionLockedAt: null, updatedAt: new Date() }).where(eq(tasks.id, taskId)).returning();
        return updated;
      });
    }
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
