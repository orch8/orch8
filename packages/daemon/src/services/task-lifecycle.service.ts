import { eq } from "drizzle-orm";
import { tasks, projects } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import { isValidTransition, type TaskColumn } from "./task-transitions.js";
import { TaskService } from "./task.service.js";
import { WorktreeService } from "./worktree.service.js";
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
    private worktreeService: WorktreeService,
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

    // ── Side effects by target state ──

    if (to === "in_progress") {
      if (!opts?.agentId || !opts?.runId) {
        throw new Error("agentId and runId are required when moving to in_progress");
      }
      updateValues.executionAgentId = opts.agentId;
      updateValues.executionRunId = opts.runId;
      updateValues.executionLockedAt = new Date();

      // Create worktree for quick/complex tasks on first dispatch
      if (task.taskType !== "brainstorm" && !task.worktreePath) {
        const project = await this.loadProject(task.projectId);
        const slug = WorktreeService.slugify(task.title);
        const worktreePath = await this.worktreeService.create({
          homeDir: project.homeDir,
          worktreeDir: project.worktreeDir,
          taskId: task.id,
          slug,
          defaultBranch: project.defaultBranch,
        });
        updateValues.worktreePath = worktreePath;
        updateValues.branch = `task/${task.id}/${slug}`;
      }
    }

    if (to === "blocked") {
      // Release execution lock — task is not being actively worked
      updateValues.executionAgentId = null;
      updateValues.executionRunId = null;
      updateValues.executionLockedAt = null;
    }

    if (to === "done") {
      updateValues.executionAgentId = null;
      updateValues.executionRunId = null;
      updateValues.executionLockedAt = null;

      // Remove worktree
      if (task.worktreePath && task.branch) {
        const project = await this.loadProject(task.projectId);
        const slug = task.branch.split("/").pop() ?? "";
        await this.worktreeService.remove({
          homeDir: project.homeDir,
          worktreeDir: project.worktreeDir,
          taskId: task.id,
          slug,
        });
      }
    }

    // Apply the transition
    const [updated] = await this.db
      .update(tasks)
      .set(updateValues)
      .where(eq(tasks.id, taskId))
      .returning();

    // Broadcast task_transitioned event (spec §14 §2.1)
    this.broadcastService?.taskTransitioned(task.projectId, {
      taskId,
      from,
      to,
      agentId: opts?.agentId,
    });

    // Post-transition: unblock dependents when task completes
    if (to === "done") {
      await this.taskService.unblockResolved(task.projectId);
    }

    return updated;
  }

  private async loadProject(projectId: string) {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project) throw new Error("Project not found");
    return project;
  }
}
