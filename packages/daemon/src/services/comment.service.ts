import { eq, and, asc } from "drizzle-orm";
import { comments, tasks } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import type { BroadcastService } from "./broadcast.service.js";
import { resolveWakeTargets } from "./wake-targets.js";

type Comment = typeof comments.$inferSelect;
type WakeReason = "mention" | "assignment";

interface HeartbeatLike {
  enqueueWakeup(
    agentId: string,
    projectId: string,
    opts: {
      source: WakeReason;
      taskId?: string;
      commentId?: string;
      reason?: string;
    },
  ): Promise<unknown>;
}

export interface CreateCommentInput {
  taskId: string;
  author: string;
  body: string;
  type?: "inline" | "system" | "verification" | "brainstorm";
  lineRef?: string;
  notify?: boolean;
  mentions?: string[];
}

export interface CommentListFilter {
  type?: "inline" | "system" | "verification" | "brainstorm";
}

export class CommentService {
  constructor(
    private db: SchemaDb,
    private heartbeatService?: HeartbeatLike,
    private broadcastService?: BroadcastService,
  ) {}

  async create(input: CreateCommentInput): Promise<Comment & { mentions: string[] }> {
    const mentions = dedupe(input.mentions ?? []);
    const insertValues: typeof comments.$inferInsert = {
      taskId: input.taskId,
      author: input.author,
      body: input.body,
      type: input.type ?? "inline",
      lineRef: input.lineRef,
      mentions,
    };

    const [comment] = await this.db.insert(comments).values({
      ...insertValues,
    }).returning();

    const [task] = await this.db
      .select({
        projectId: tasks.projectId,
        assignee: tasks.assignee,
      })
      .from(tasks)
      .where(eq(tasks.id, input.taskId))
      .limit(1);

    if (task) {
      const targets = resolveWakeTargets({
        authorAgentId: input.author,
        mentionedAgentIds: mentions,
        taskAssigneeAgentId: task.assignee,
        notifyEnabled: input.notify ?? true,
      });

      await Promise.all(targets.map((target) => this.heartbeatService?.enqueueWakeup(
        target.agentId,
        task.projectId,
        {
          source: target.reason,
          taskId: input.taskId,
          commentId: comment.id,
          reason: target.reason === "mention"
            ? `mentioned in comment ${comment.id}`
            : `comment added to assigned task ${input.taskId}`,
        },
      )));

      this.broadcastService?.commentNew(task.projectId, {
        taskId: input.taskId,
        commentId: comment.id,
        type: comment.type,
        authorId: comment.author,
      });
    }

    return { ...comment, mentions };
  }

  async listByTask(taskId: string, filter?: CommentListFilter): Promise<Comment[]> {
    const conditions = [eq(comments.taskId, taskId)];

    if (filter?.type) {
      conditions.push(eq(comments.type, filter.type));
    }

    return this.db
      .select()
      .from(comments)
      .where(and(...conditions))
      .orderBy(asc(comments.createdAt));
  }

  async delete(id: string): Promise<void> {
    const result = await this.db
      .delete(comments)
      .where(eq(comments.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error("Comment not found");
    }
  }
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}
