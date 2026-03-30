import { eq } from "drizzle-orm";
import { tasks, projects } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import { isValidTransition, type TaskColumn } from "./task-transitions.js";
import { TaskService } from "./task.service.js";
import { WorktreeService } from "./worktree.service.js";

type Task = typeof tasks.$inferSelect;

export interface TransitionOpts {
  agentId?: string;
  runId?: string;
}

export interface LifecycleHooks {
  onReview?: (taskId: string, projectId: string) => Promise<void>;
}

export class TaskLifecycleService {
  constructor(
    private db: SchemaDb,
    private taskService: TaskService,
    private worktreeService: WorktreeService,
    private hooks?: LifecycleHooks,
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

    if (to === "review" || to === "verification") {
      // Clear execution lock when leaving in_progress
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

    // Post-transition: trigger verification pipeline on review
    if (to === "review" && this.hooks?.onReview) {
      const project = await this.loadProject(task.projectId);
      if (project.verificationRequired) {
        await this.hooks.onReview(taskId, task.projectId);
      }
    }

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
