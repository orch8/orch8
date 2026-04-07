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
import { extractCards } from "./chat-card-parser.js";

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
    let assistantRowId: string | null = null;
    let runRowId: string | null = null;
    let accumulated = "";

    try {
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
      assistantRowId = assistantRow.id;

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
      runRowId = runRow.id;

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

      // 9b. Auto-title on first assistant turn if still the default.
      if (chat.title === "New chat") {
        const newTitle = deriveChatTitle(userMessageForPrompt);
        await this.db
          .update(chats)
          .set({ title: newTitle, updatedAt: new Date() })
          .where(eq(chats.id, chat.id));
      }

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

      if (assistantRowId) {
        await this.db
          .update(chatMessages)
          .set({ status: "error", content: accumulated + `\n[error: ${message}]` })
          .where(eq(chatMessages.id, assistantRowId));
      }

      if (runRowId) {
        await this.db
          .update(heartbeatRuns)
          .set({
            status: "failed",
            error: message,
            finishedAt: new Date(),
          })
          .where(eq(heartbeatRuns.id, runRowId));
      }

      this.broadcast.chatMessageError(chat.projectId, {
        chatId: chat.id,
        messageId: assistantRowId,
        error: message,
      });
    }
  }

  // ─── Card Decisions ───────────────────────────────────

  /**
   * Approves or cancels a card that was previously emitted by the
   * assistant. Idempotent: re-calling with the same decision returns
   * the existing state without re-triggering a run.
   */
  async decideCard(
    chatId: string,
    cardId: string,
    decision: "approved" | "cancelled",
    actor: string,
  ): Promise<ChatMessage> {
    const chat = await this.getChat(chatId);
    if (!chat) throw new Error("Chat not found");

    // Find the assistant message that contains this card.
    const rows = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.chatId, chatId));

    const target = rows.find((row) => {
      const arr = row.cards as ExtractedCard[];
      return Array.isArray(arr) && arr.some((c) => c.id === cardId);
    });

    if (!target) throw new Error("Card not found in any message in this chat");

    const cardsArray = (target.cards as ExtractedCard[]) ?? [];
    const idx = cardsArray.findIndex((c) => c.id === cardId);
    const card = cardsArray[idx];

    // Idempotency: return current state if already decided.
    if (card.status !== "pending") {
      return target;
    }

    const updated: ExtractedCard = {
      ...card,
      status: decision,
      decidedAt: new Date().toISOString(),
      decidedBy: actor,
    };
    const newCards = [...cardsArray];
    newCards[idx] = updated;

    const [updatedMessage] = await this.db
      .update(chatMessages)
      .set({ cards: newCards })
      .where(eq(chatMessages.id, target.id))
      .returning();

    this.broadcast.chatCardDecision(chat.projectId, {
      chatId,
      cardId,
      status: decision,
    });

    // Write a synthetic system message the agent will see on its next turn.
    const systemContent = decision === "approved"
      ? `User approved ${cardId}: ${card.summary}`
      : `User cancelled ${cardId}: ${card.summary}`;

    await this.db.insert(chatMessages).values({
      chatId,
      role: "system",
      content: systemContent,
      status: "complete",
    });

    await this.db
      .update(chats)
      .set({ lastMessageAt: new Date(), updatedAt: new Date() })
      .where(eq(chats.id, chatId));

    // Resume the agent so it can act on the decision.
    // Pass the system content as the "user message" for prompt interpolation;
    // Claude will already have the full prior context via --resume.
    void this.runAssistantTurn(chat, systemContent).catch((err) => {
      this.logger?.error(
        { err, chatId, cardId },
        "Assistant follow-up turn after card decision failed",
      );
    });

    return updatedMessage;
  }

  // ─── Session Invalidation ─────────────────────────────

  /**
   * Wipes the persisted Claude session for this chat. Called by the
   * agent-update hook (future: wired in plan 06 or when the agent
   * editor is refactored). The next turn will start a fresh session.
   */
  async invalidateSession(chatId: string): Promise<void> {
    const chat = await this.getChat(chatId);
    if (!chat) return;
    await this.sessionManager.clearSession({
      agentId: chat.agentId,
      taskKey: chat.id,
      adapterType: "claude_local",
    });
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

/**
 * Produces a short title from the user's first message. Keeps the
 * first line, strips leading markdown punctuation, truncates, and
 * capitalises. Pure — trivial to unit test.
 */
export function deriveChatTitle(raw: string): string {
  const firstLine = raw.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  const stripped = firstLine.replace(/^[#>\-*\s]+/, "");
  const truncated = stripped.slice(0, 60).trim();
  if (truncated.length === 0) return "New chat";
  const capitalised = truncated[0].toUpperCase() + truncated.slice(1);
  return capitalised.length === 60 ? capitalised + "…" : capitalised;
}
