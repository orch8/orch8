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

  // ─── Ingestion ─────────────────────────────────────────

  /**
   * Writes the user's message row, then triggers an agent run in the
   * background. Returns the user message row immediately; the caller
   * (HTTP handler) does not wait for the run to finish — completion is
   * broadcast over WebSocket.
   */
  async sendUserMessage(
    chatId: string,
    content: string,
  ): Promise<ChatMessage> {
    const chat = await this.getChat(chatId);
    if (!chat) throw new Error("Chat not found");
    if (chat.archived) throw new Error("Chat is archived");

    const [userRow] = await this.db
      .insert(chatMessages)
      .values({
        chatId,
        role: "user",
        content,
        status: "complete",
      })
      .returning();

    await this.db
      .update(chats)
      .set({ lastMessageAt: new Date(), updatedAt: new Date() })
      .where(eq(chats.id, chatId));

    // Fire-and-forget the assistant turn. Errors are surfaced over
    // the websocket chat_message_error event, not the HTTP response.
    void this.runAssistantTurn(chat, userRow.content).catch((err) => {
      this.logger?.error(
        { err, chatId, messageId: userRow.id },
        "Assistant turn failed",
      );
    });

    return userRow;
  }

  /**
   * Core per-turn flow. See plan 01 §Task 7 for the step-by-step
   * reasoning. Intended to be called from sendUserMessage or, later,
   * from decideCard (which also triggers a new turn).
   */
  private async runAssistantTurn(
    chat: Chat,
    userMessageForPrompt: string,
  ): Promise<void> {
    const project = await this.getProject(chat.projectId);
    if (!project) throw new Error("Project not found");

    const agent = await this.getAgent(chat.agentId, chat.projectId);
    if (!agent) throw new Error(`Chat agent ${chat.agentId} not found`);

    // 1. Insert placeholder assistant message row (status=streaming)
    const [assistantRow] = await this.db
      .insert(chatMessages)
      .values({
        chatId: chat.id,
        role: "assistant",
        content: "",
        status: "streaming",
      })
      .returning();

    this.broadcast.chatMessageStarted(chat.projectId, {
      chatId: chat.id,
      messageId: assistantRow.id,
    });

    // 2. Insert a heartbeatRuns row so the run appears in the runs viewer.
    const [runRow] = await this.db
      .insert(heartbeatRuns)
      .values({
        agentId: agent.id,
        projectId: chat.projectId,
        taskId: null,
        invocationSource: "on_demand",
        status: "running",
        startedAt: new Date(),
      })
      .returning();

    let accumulated = "";

    try {
      // 3. Build RunContext. Note the sessionKey=chatId pin.
      const ctx = {
        agentId: agent.id,
        agentName: agent.name,
        projectId: chat.projectId,
        runId: runRow.id,
        wakeReason: "on_demand" as const,
        apiUrl: this.apiUrl,
        cwd: project.homeDir,
        sessionKey: chat.id,
        context: {
          userMessage: userMessageForPrompt,
        },
        onEvent: (event: unknown) => {
          // Accumulate assistant text chunks and broadcast them live.
          const maybeText = extractStreamText(event);
          if (!maybeText) return;
          accumulated += maybeText;
          this.broadcast.chatMessageChunk(chat.projectId, {
            chatId: chat.id,
            messageId: assistantRow.id,
            chunk: maybeText,
          });
        },
      };

      // 4. Build prompts. The chat agent's promptTemplate is
      //    expected to reference {{context.userMessage}}; if it
      //    does not, we fall back to raw content.
      const heartbeatTemplate = agent.promptTemplate && agent.promptTemplate.length > 0
        ? agent.promptTemplate
        : "{{context.userMessage}}";

      const prompts = {
        heartbeatTemplate,
        bootstrapTemplate: agent.bootstrapPromptTemplate ?? undefined,
        desiredSkills: agent.desiredSkills ?? undefined,
      };

      // 5. Execute the run.
      const adapterConfig = {
        model: agent.model,
        effort: (agent.effort as "low" | "medium" | "high" | undefined) ?? undefined,
        maxTurnsPerRun: agent.maxTurns,
        cwd: project.homeDir,
      };

      // Cast ctx — the full RunContext type lives in the adapter module
      // and we intentionally keep the chat-side type minimal. The adapter
      // treats missing optional fields as undefined.
      const result = await this.adapter.runAgent(
        adapterConfig,
        ctx as unknown as Parameters<ClaudeLocalAdapter["runAgent"]>[1],
        prompts as unknown as Parameters<ClaudeLocalAdapter["runAgent"]>[2],
      );

      // 6. Parse cards out of the accumulated output (fall back to
      //    result.result if the stream never emitted assistant text).
      const rawOutput = accumulated.length > 0 ? accumulated : (result.result ?? "");
      const { extractCards } = await import("./chat-card-parser.js");
      const { cards } = extractCards(rawOutput);

      // 7. Update the assistant row.
      await this.db
        .update(chatMessages)
        .set({
          content: rawOutput,
          cards: cards as unknown as ExtractedCard[],
          runId: runRow.id,
          status: result.error ? "error" : "complete",
        })
        .where(eq(chatMessages.id, assistantRow.id));

      // 8. Update the run row.
      await this.db
        .update(heartbeatRuns)
        .set({
          status: result.error ? "failed" : "succeeded",
          exitCode: result.exitCode,
          error: result.error,
          errorCode: result.errorCode,
          usageJson: result.usage,
          costUsd: result.costUsd,
          billingType: result.billingType,
          model: result.model,
          sessionIdAfter: result.sessionId,
          finishedAt: new Date(),
          resultJson: result.result ? { text: result.result } : null,
        })
        .where(eq(heartbeatRuns.id, runRow.id));

      // 9. Bump the chat's lastMessageAt.
      await this.db
        .update(chats)
        .set({ lastMessageAt: new Date(), updatedAt: new Date() })
        .where(eq(chats.id, chat.id));

      // 10. Broadcast completion.
      if (result.error) {
        this.broadcast.chatMessageError(chat.projectId, {
          chatId: chat.id,
          messageId: assistantRow.id,
          error: result.error,
        });
      } else {
        this.broadcast.chatMessageComplete(chat.projectId, {
          chatId: chat.id,
          messageId: assistantRow.id,
          runId: runRow.id,
          cardCount: cards.length,
        });
      }
    } catch (err) {
      const message = (err as Error).message ?? "unknown error";
      await this.db
        .update(chatMessages)
        .set({ status: "error", content: accumulated + `\n[error: ${message}]` })
        .where(eq(chatMessages.id, assistantRow.id));

      await this.db
        .update(heartbeatRuns)
        .set({
          status: "failed",
          error: message,
          finishedAt: new Date(),
        })
        .where(eq(heartbeatRuns.id, runRow.id));

      this.broadcast.chatMessageError(chat.projectId, {
        chatId: chat.id,
        messageId: assistantRow.id,
        error: message,
      });
    }
  }

  // ─── Internal helpers ─────────────────────────────────

  private async getProject(projectId: string) {
    const [row] = await this.db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId));
    return row ?? null;
  }

  private async getAgent(agentId: string, projectId: string) {
    const [row] = await this.db
      .select()
      .from(agentsTable)
      .where(and(eq(agentsTable.id, agentId), eq(agentsTable.projectId, projectId)));
    return row ?? null;
  }
}

/**
 * Best-effort extraction of text tokens from adapter stream events.
 * The adapter emits parsed StreamEvent objects via ctx.onEvent; the
 * `assistant` subtype carries text content arrays.
 */
function extractStreamText(event: unknown): string | null {
  if (typeof event !== "object" || event === null) return null;
  const e = event as { type?: string; message?: { content?: unknown } };
  if (e.type !== "assistant") return null;
  const content = e.message?.content;
  if (!Array.isArray(content)) return null;
  let out = "";
  for (const part of content) {
    if (
      typeof part === "object" &&
      part !== null &&
      (part as { type?: string }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      out += (part as { text: string }).text;
    }
  }
  return out.length > 0 ? out : null;
}
