import { eq } from "drizzle-orm";
import { tasks } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import type { CommentService } from "./comment.service.js";

type Task = typeof tasks.$inferSelect;
type VerificationResult = "pass" | "fail" | "partial";

export type EnqueueWakeupFn = (
  agentId: string,
  projectId: string,
  taskId: string,
  reason: string,
) => Promise<void>;

export interface VerificationVerdict {
  result: VerificationResult;
  report: string;
}

export interface ImplementerResponse {
  agrees: boolean;
  response?: string;
}

export interface RefereeVerdict {
  result: VerificationResult;
  report: string;
}

export class VerificationService {
  constructor(
    private db: SchemaDb,
    private commentService: CommentService,
    private enqueueWakeup: EnqueueWakeupFn,
  ) {}

  /**
   * Called when a task moves to the `review` column.
   * Spawns a verifier agent wakeup targeting this task.
   */
  async spawnVerifier(
    taskId: string,
    verifierAgentId: string,
  ): Promise<void> {
    const task = await this.loadTask(taskId);

    await this.db
      .update(tasks)
      .set({
        column: "verification",
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    await this.enqueueWakeup(
      verifierAgentId,
      task.projectId,
      taskId,
      "verification_requested",
    );
  }

  /**
   * Called by the verifier agent after reviewing the task.
   * Records the verdict and routes to the next step.
   */
  async submitVerdict(
    taskId: string,
    verdict: VerificationVerdict,
  ): Promise<{ action: "done" | "awaiting_implementer" | "referee_needed" }> {
    await this.loadTask(taskId);

    await this.db
      .update(tasks)
      .set({
        verificationResult: verdict.result,
        verifierReport: verdict.report,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    await this.commentService.create({
      taskId,
      author: "system:verifier",
      body: `## Verification Result: ${verdict.result.toUpperCase()}\n\n${verdict.report}`,
      type: "verification",
    });

    if (verdict.result === "pass") {
      await this.db
        .update(tasks)
        .set({
          column: "done",
          executionAgentId: null,
          executionRunId: null,
          executionLockedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));

      return { action: "done" };
    }

    return {
      action: verdict.result === "fail" ? "awaiting_implementer" : "referee_needed",
    };
  }

  /**
   * Called when the implementer responds to a FAIL verdict.
   */
  async submitImplementerResponse(
    taskId: string,
    response: ImplementerResponse,
  ): Promise<{ action: "in_progress" | "referee_needed" }> {
    const task = await this.loadTask(taskId);

    const responseText = response.response ?? (response.agrees ? "Agrees with findings" : "Disagrees with findings");
    await this.commentService.create({
      taskId,
      author: `agent:${task.assignee ?? "implementer"}`,
      body: `## Implementer Response\n\n${responseText}`,
      type: "verification",
    });

    if (response.agrees) {
      await this.db
        .update(tasks)
        .set({
          column: "in_progress",
          verificationResult: null,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));

      // Re-dispatch implementer to fix issues
      if (task.assignee) {
        await this.enqueueWakeup(task.assignee, task.projectId, taskId, "verification_fix_needed");
      }

      return { action: "in_progress" };
    }

    return { action: "referee_needed" };
  }

  /**
   * Called to spawn the referee for dispute resolution.
   */
  async spawnReferee(
    taskId: string,
    refereeAgentId: string,
  ): Promise<void> {
    const task = await this.loadTask(taskId);

    await this.enqueueWakeup(
      refereeAgentId,
      task.projectId,
      taskId,
      "referee_requested",
    );
  }

  /**
   * Called by the referee agent after reviewing both sides.
   */
  async submitRefereeVerdict(
    taskId: string,
    verdict: RefereeVerdict,
  ): Promise<{ action: "done" | "in_progress" | "done_with_caveats" }> {
    const task = await this.loadTask(taskId);

    await this.db
      .update(tasks)
      .set({
        refereeVerdict: verdict.report,
        verificationResult: verdict.result,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    await this.commentService.create({
      taskId,
      author: "system:referee",
      body: `## Referee Verdict: ${verdict.result.toUpperCase()}\n\n${verdict.report}`,
      type: "verification",
    });

    if (verdict.result === "pass") {
      await this.db
        .update(tasks)
        .set({
          column: "done",
          executionAgentId: null,
          executionRunId: null,
          executionLockedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));
      return { action: "done" };
    }

    if (verdict.result === "fail") {
      await this.db
        .update(tasks)
        .set({
          column: "in_progress",
          verificationResult: null,
          verifierReport: null,
          refereeVerdict: null,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));

      // Re-dispatch implementer to fix issues
      if (task.assignee) {
        await this.enqueueWakeup(task.assignee, task.projectId, taskId, "referee_ordered_fix");
      }

      return { action: "in_progress" };
    }

    // PARTIAL → done with caveats
    await this.db
      .update(tasks)
      .set({
        column: "done",
        executionAgentId: null,
        executionRunId: null,
        executionLockedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
    return { action: "done_with_caveats" };
  }

  private async loadTask(taskId: string): Promise<Task> {
    const [task] = await this.db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) throw new Error("Task not found");
    return task;
  }
}
