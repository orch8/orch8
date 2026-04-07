import { eq, and, desc, lt } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import {
  chats,
  chatMessages,
  agents as agentsTable,
  projects as projectsTable,
  heartbeatRuns,
} from "@orch/shared/db";
import type { ExtractedCard } from "@orch/shared";
import type { SchemaDb } from "../db/client.js";
import type { ClaudeLocalAdapter } from "../adapter/claude-local-adapter.js";
import type { SessionManager } from "../adapter/session-manager.js";
import type { BroadcastService } from "./broadcast.service.js";

type Chat = typeof chats.$inferSelect;
type ChatMessage = typeof chatMessages.$inferSelect;

export class ChatService {
  private logger?: FastifyBaseLogger;

  constructor(
    private db: SchemaDb,
    private adapter: ClaudeLocalAdapter,
    private sessionManager: SessionManager,
    private broadcast: BroadcastService,
    private apiUrl: string,
  ) {}

  setLogger(logger: FastifyBaseLogger) {
    this.logger = logger;
  }

  // ─── CRUD ──────────────────────────────────────────────

  async listChats(
    projectId: string,
    opts: { includeArchived?: boolean } = {},
  ): Promise<Chat[]> {
    const where = opts.includeArchived
      ? eq(chats.projectId, projectId)
      : and(eq(chats.projectId, projectId), eq(chats.archived, false));
    return this.db
      .select()
      .from(chats)
      .where(where)
      .orderBy(desc(chats.pinned), desc(chats.lastMessageAt));
  }

  async getChat(chatId: string): Promise<Chat | null> {
    const rows = await this.db.select().from(chats).where(eq(chats.id, chatId));
    return rows[0] ?? null;
  }

  async createChat(input: {
    projectId: string;
    agentId: string;
    title?: string;
  }): Promise<Chat> {
    const [row] = await this.db
      .insert(chats)
      .values({
        projectId: input.projectId,
        agentId: input.agentId,
        title: input.title ?? "New chat",
      })
      .returning();
    return row;
  }

  async updateChat(
    chatId: string,
    patch: { title?: string; pinned?: boolean; archived?: boolean },
  ): Promise<Chat> {
    const [row] = await this.db
      .update(chats)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(chats.id, chatId))
      .returning();
    if (!row) throw new Error("Chat not found");
    return row;
  }

  async deleteChat(chatId: string): Promise<void> {
    await this.db
      .update(chats)
      .set({ archived: true, updatedAt: new Date() })
      .where(eq(chats.id, chatId));
  }

  async listMessages(
    chatId: string,
    opts: { limit?: number; before?: string } = {},
  ): Promise<ChatMessage[]> {
    const limit = Math.min(opts.limit ?? 100, 500);
    let where = eq(chatMessages.chatId, chatId);
    if (opts.before) {
      const [anchor] = await this.db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.id, opts.before));
      if (anchor) {
        where = and(
          eq(chatMessages.chatId, chatId),
          lt(chatMessages.createdAt, anchor.createdAt),
        )!;
      }
    }
    const rows = await this.db
      .select()
      .from(chatMessages)
      .where(where)
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);
    return rows.reverse(); // return chronological
  }

  // ─── Ingestion / decisions / session invalidation ──
  // (Implemented in later tasks in this plan.)
}
