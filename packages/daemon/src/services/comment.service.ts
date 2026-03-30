import { eq, and, asc } from "drizzle-orm";
import { comments } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";

type Comment = typeof comments.$inferSelect;

export interface CreateCommentInput {
  taskId: string;
  author: string;
  body: string;
  type?: "inline" | "system" | "verification" | "brainstorm";
  lineRef?: string;
}

export interface CommentListFilter {
  type?: "inline" | "system" | "verification" | "brainstorm";
}

export class CommentService {
  constructor(private db: SchemaDb) {}

  async create(input: CreateCommentInput): Promise<Comment> {
    const [comment] = await this.db.insert(comments).values({
      taskId: input.taskId,
      author: input.author,
      body: input.body,
      type: input.type ?? "inline",
      lineRef: input.lineRef,
    }).returning();

    return comment;
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
