import { eq, and, desc, lt, inArray } from "drizzle-orm";
import { notifications } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import type { NotificationType } from "@orch/shared";

export class NotificationService {
  constructor(private db: SchemaDb) {}

  async create(params: {
    projectId: string;
    type: NotificationType;
    title: string;
    message: string;
    link?: string;
  }) {
    const [row] = await this.db
      .insert(notifications)
      .values({
        projectId: params.projectId,
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link ?? null,
      })
      .returning();
    return row;
  }

  async list(projectId: string, opts?: { unread?: boolean; limit?: number; offset?: number }) {
    const conditions = [eq(notifications.projectId, projectId)];
    if (opts?.unread) {
      conditions.push(eq(notifications.read, false));
    }
    return this.db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0);
  }

  async markRead(projectId: string, ids: string[]) {
    await this.db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.projectId, projectId),
          inArray(notifications.id, ids),
        ),
      );
  }

  async markAllRead(projectId: string) {
    await this.db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.projectId, projectId),
          eq(notifications.read, false),
        ),
      );
  }

  async pruneOlderThan(days: number) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    await this.db
      .delete(notifications)
      .where(lt(notifications.createdAt, cutoff));
  }
}
