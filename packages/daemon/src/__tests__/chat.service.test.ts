import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import {
  projects,
  agents,
  chats,
  chatMessages,
  heartbeatRuns,
} from "@orch/shared/db";
import { ChatService } from "../services/chat.service.js";
import { BroadcastService } from "../services/broadcast.service.js";
import { SessionManager } from "../adapter/session-manager.js";
import type { ExtractedCard } from "@orch/shared";
import { eq } from "drizzle-orm";

const TEST_API_URL = "http://localhost:3847";

function makeMockAdapter(mockOutput: string) {
  return {
    runAgent: vi.fn(async (_cfg: unknown, ctx: any, _instructions: unknown) => {
      // Simulate streaming chunks
      if (typeof ctx.onEvent === "function") {
        ctx.onEvent({
          type: "assistant",
          message: { content: [{ type: "text", text: mockOutput }] },
        });
      }
      return {
        sessionId: "sess_mock",
        model: "claude-sonnet-4-6",
        result: mockOutput,
        usage: { input_tokens: 10, output_tokens: 10 },
        costUsd: 0.01,
        billingType: "api" as const,
        exitCode: 0,
        signal: null,
        error: null,
        errorCode: null,
        events: [],
      };
    }),
  };
}

describe("ChatService", () => {
  let testDb: TestDb;
  let projectId: string;
  let agentId: string;
  let service: ChatService;
  let broadcast: BroadcastService;
  let sessionMgr: SessionManager;

  beforeAll(async () => {
    testDb = await setupTestDb();
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    // Clean tables that accumulate across tests
    await testDb.db.delete(chatMessages);
    await testDb.db.delete(chats);
    await testDb.db.delete(heartbeatRuns);
    await testDb.db.delete(agents);
    await testDb.db.delete(projects);

    const [project] = await testDb.db
      .insert(projects)
      .values({
        name: "t",
        slug: `t-${Date.now()}`,
        homeDir: "/tmp/orch8-chat-test",
      })
      .returning();
    projectId = project.id;

    const [agent] = await testDb.db
      .insert(agents)
      .values({
        id: "chat",
        projectId,
        name: "Project Chat",
        role: "custom",
        model: "claude-sonnet-4-6",
        wakeOnOnDemand: true,
      })
      .returning();
    agentId = agent.id;

    const sockets = new Set<any>();
    broadcast = new BroadcastService(sockets);
    sessionMgr = new SessionManager(testDb.db);
  });

  // ─── CRUD ──────────────────────────────────────────

  it("creates a chat with a default title", async () => {
    service = new ChatService(
      testDb.db,
      makeMockAdapter("hello") as any,
      sessionMgr,
      broadcast,
      TEST_API_URL,
    );
    const chat = await service.createChat({ projectId, agentId });
    expect(chat.title).toBe("New chat");
    expect(chat.archived).toBe(false);
    expect(chat.pinned).toBe(false);
    expect(chat.id).toMatch(/^chat_/);
  });

  it("lists chats with newest first, pinned on top", async () => {
    service = new ChatService(
      testDb.db,
      makeMockAdapter("ok") as any,
      sessionMgr,
      broadcast,
      TEST_API_URL,
    );
    const a = await service.createChat({ projectId, agentId, title: "A" });
    const b = await service.createChat({ projectId, agentId, title: "B" });
    await service.updateChat(b.id, { pinned: true });

    const list = await service.listChats(projectId);
    expect(list[0].id).toBe(b.id); // pinned first
    expect(list[1].id).toBe(a.id);
  });

  it("soft-deletes by setting archived=true", async () => {
    service = new ChatService(
      testDb.db,
      makeMockAdapter("ok") as any,
      sessionMgr,
      broadcast,
      TEST_API_URL,
    );
    const chat = await service.createChat({ projectId, agentId });
    await service.deleteChat(chat.id);
    const list = await service.listChats(projectId);
    expect(list).toHaveLength(0);
    const listAll = await service.listChats(projectId, { includeArchived: true });
    expect(listAll).toHaveLength(1);
  });

  // ─── Ingestion ────────────────────────────────────

  it("sendUserMessage writes a user row and triggers adapter.runAgent", async () => {
    const adapter = makeMockAdapter("Thanks for the message.");
    service = new ChatService(
      testDb.db,
      adapter as any,
      sessionMgr,
      broadcast,
      TEST_API_URL,
    );
    const chat = await service.createChat({ projectId, agentId });

    const userRow = await service.sendUserMessage(chat.id, "hello");

    expect(userRow.role).toBe("user");
    expect(userRow.content).toBe("hello");

    // Wait for the fire-and-forget assistant turn to finish.
    const msgs = await vi.waitFor(async () => {
      const list = await service.listMessages(chat.id);
      expect(list.map((m) => m.role)).toEqual(["user", "assistant"]);
      return list;
    });
    expect(adapter.runAgent).toHaveBeenCalledTimes(1);

    // The adapter's third arg is RunAgentInstructions; on_demand wakes must
    // carry the raw user message through wake.userMessage (not template
    // interpolation via ctx.context).
    const instructions = adapter.runAgent.mock.calls[0][2] as {
      projectRoot: string;
      slug: string;
      wake: { source: string; userMessage?: string };
    };
    expect(instructions.wake).toEqual({ source: "on_demand", userMessage: "hello" });
    expect(instructions.slug).toBe("chat");
    expect(instructions.projectRoot).toBe("/tmp/orch8-chat-test");

    expect(msgs[1].content).toContain("Thanks for the message.");
    expect(msgs[1].runId).toBeTruthy();
  });

  it("sendUserMessage stores resolved mentions and wakes mentioned agents", async () => {
    const adapter = makeMockAdapter("ok");
    const heartbeat = { enqueueWakeup: vi.fn(async () => ({ id: "wake_1" })) };
    service = new ChatService(
      testDb.db,
      adapter as any,
      sessionMgr,
      broadcast,
      TEST_API_URL,
      heartbeat as any,
    );
    await testDb.db.insert(agents).values([
      {
        id: "alice",
        projectId,
        name: "Alice",
        role: "custom",
        model: "claude-sonnet-4-6",
      },
      {
        id: "bob",
        projectId,
        name: "Bob",
        role: "custom",
        model: "claude-sonnet-4-6",
      },
    ]);
    const chat = await service.createChat({ projectId, agentId });

    const userRow = await service.sendUserMessage(
      chat.id,
      "@alice @bob @alice @unknown please look",
    );

    expect(userRow.mentions).toEqual(["alice", "bob"]);
    expect(heartbeat.enqueueWakeup).toHaveBeenCalledTimes(2);
    expect(heartbeat.enqueueWakeup).toHaveBeenNthCalledWith(
      1,
      "alice",
      projectId,
      expect.objectContaining({
        source: "mention",
        payload: expect.objectContaining({
          chatId: chat.id,
          messageId: userRow.id,
        }),
      }),
    );
    expect(heartbeat.enqueueWakeup).toHaveBeenNthCalledWith(
      2,
      "bob",
      projectId,
      expect.objectContaining({ source: "mention" }),
    );

    const [stored] = await testDb.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, userRow.id));
    expect(stored.mentions).toEqual(["alice", "bob"]);
  });

  it("sendUserMessage suppresses mention wakes when notify is false", async () => {
    const adapter = makeMockAdapter("ok");
    const heartbeat = { enqueueWakeup: vi.fn(async () => ({ id: "wake_1" })) };
    service = new ChatService(
      testDb.db,
      adapter as any,
      sessionMgr,
      broadcast,
      TEST_API_URL,
      heartbeat as any,
    );
    await testDb.db.insert(agents).values({
      id: "alice",
      projectId,
      name: "Alice",
      role: "custom",
      model: "claude-sonnet-4-6",
    });
    const chat = await service.createChat({ projectId, agentId });

    const userRow = await service.sendUserMessage(chat.id, "@alice", { notify: false });

    expect(userRow.mentions).toEqual(["alice"]);
    expect(heartbeat.enqueueWakeup).not.toHaveBeenCalled();
  });

  it("sendUserMessage does not enqueue a mention wake for the chat agent", async () => {
    const adapter = makeMockAdapter("ok");
    const heartbeat = { enqueueWakeup: vi.fn(async () => ({ id: "wake_1" })) };
    service = new ChatService(
      testDb.db,
      adapter as any,
      sessionMgr,
      broadcast,
      TEST_API_URL,
      heartbeat as any,
    );
    const chat = await service.createChat({ projectId, agentId });

    const userRow = await service.sendUserMessage(chat.id, "@chat can you answer?");

    expect(userRow.mentions).toEqual(["chat"]);
    expect(heartbeat.enqueueWakeup).not.toHaveBeenCalled();
  });

  it("extracts cards from assistant output", async () => {
    const fenced = [
      "Sure, I'll create that agent.",
      "```orch8-card",
      '{"kind":"confirm_create_agent","summary":"Create qa-bot","payload":{"name":"qa-bot"}}',
      "```",
    ].join("\n");
    const adapter = makeMockAdapter(fenced);
    service = new ChatService(
      testDb.db,
      adapter as any,
      sessionMgr,
      broadcast,
      TEST_API_URL,
    );
    const chat = await service.createChat({ projectId, agentId });
    await service.sendUserMessage(chat.id, "create a qa agent");

    const msgs = await vi.waitFor(async () => {
      const list = await service.listMessages(chat.id);
      expect(list.some((m) => m.role === "assistant")).toBe(true);
      return list;
    });
    const assistant = msgs.find((m) => m.role === "assistant")!;
    const cards = assistant.cards as ExtractedCard[];
    expect(cards).toHaveLength(1);
    expect(cards[0].kind).toBe("confirm_create_agent");
    expect(cards[0].status).toBe("pending");
  });

  it("auto-titles the chat from the first user message", async () => {
    const adapter = makeMockAdapter("ok");
    service = new ChatService(
      testDb.db,
      adapter as any,
      sessionMgr,
      broadcast,
      TEST_API_URL,
    );
    const chat = await service.createChat({ projectId, agentId });
    await service.sendUserMessage(chat.id, "plan the migration please");

    const refreshed = await vi.waitFor(async () => {
      const c = await service.getChat(chat.id);
      expect(c?.title).toBe("Plan the migration please");
      return c;
    });
    expect(refreshed?.title).toBe("Plan the migration please");
  });

  // ─── Card Decisions ──────────────────────────────

  it("decideCard marks the card approved and writes a system message", async () => {
    const fenced = [
      "```orch8-card",
      '{"kind":"confirm_create_agent","summary":"Create qa-bot","payload":{"name":"qa-bot"}}',
      "```",
    ].join("\n");
    const adapter = makeMockAdapter(fenced);
    service = new ChatService(
      testDb.db,
      adapter as any,
      sessionMgr,
      broadcast,
      TEST_API_URL,
    );
    const chat = await service.createChat({ projectId, agentId });
    await service.sendUserMessage(chat.id, "hi");

    const msgs = await vi.waitFor(async () => {
      const list = await service.listMessages(chat.id);
      expect(list.some((m) => m.role === "assistant")).toBe(true);
      return list;
    });
    const assistant = msgs.find((m) => m.role === "assistant")!;
    const card = (assistant.cards as ExtractedCard[])[0];

    await service.decideCard(chat.id, card.id, "approved", "test-user", projectId);

    // decideCard writes a system message synchronously and kicks off a
    // follow-up assistant turn asynchronously. Wait for the system row to
    // appear before asserting on the final shape.
    const refreshedMsgs = await vi.waitFor(async () => {
      const list = await service.listMessages(chat.id);
      expect(list.some((m) => m.role === "system")).toBe(true);
      return list;
    });
    const systemMsgs = refreshedMsgs.filter((m) => m.role === "system");
    expect(systemMsgs).toHaveLength(1);
    expect(systemMsgs[0].content).toContain("approved");
    expect(systemMsgs[0].content).toContain(card.id);
    expect(systemMsgs[0].content).not.toMatch(/card_card_/);

    // Card status should now be approved
    const updatedAssistant = refreshedMsgs.find((m) => m.id === assistant.id)!;
    const updatedCard = (updatedAssistant.cards as ExtractedCard[])[0];
    expect(updatedCard.status).toBe("approved");
    expect(updatedCard.decidedBy).toBe("test-user");
  });

  it("decideCard is idempotent when replayed", async () => {
    const fenced = [
      "```orch8-card",
      '{"kind":"confirm_create_task","summary":"Create task T","payload":{"title":"T"}}',
      "```",
    ].join("\n");
    const adapter = makeMockAdapter(fenced);
    service = new ChatService(
      testDb.db,
      adapter as any,
      sessionMgr,
      broadcast,
      TEST_API_URL,
    );
    const chat = await service.createChat({ projectId, agentId });
    await service.sendUserMessage(chat.id, "hi");

    const msgs = await vi.waitFor(async () => {
      const list = await service.listMessages(chat.id);
      expect(list.some((m) => m.role === "assistant")).toBe(true);
      return list;
    });
    const assistant = msgs.find((m) => m.role === "assistant")!;
    const card = (assistant.cards as ExtractedCard[])[0];

    await service.decideCard(chat.id, card.id, "approved", "user-1", projectId);
    // Wait for the follow-up assistant turn from the first decision to
    // complete so the runAgent call count assertion below is stable.
    await vi.waitFor(() => {
      expect(adapter.runAgent).toHaveBeenCalledTimes(2);
    });
    const firstDecision = (await testDb.db.select().from(chatMessages).where(eq(chatMessages.id, assistant.id)))[0];
    const firstDecidedAt = (firstDecision.cards as ExtractedCard[])[0].decidedAt;

    // Second call should be a no-op (same decidedAt preserved)
    await service.decideCard(chat.id, card.id, "approved", "user-2", projectId);
    const secondDecision = (await testDb.db.select().from(chatMessages).where(eq(chatMessages.id, assistant.id)))[0];
    expect((secondDecision.cards as ExtractedCard[])[0].decidedAt).toBe(firstDecidedAt);
    expect((secondDecision.cards as ExtractedCard[])[0].decidedBy).toBe("user-1");

    // The replayed decideCard should not have triggered another assistant turn.
    // 2 calls = 1 for initial user message + 1 for the first approval follow-up.
    expect(adapter.runAgent).toHaveBeenCalledTimes(2);
  });

  it("decideCard refuses to touch a card in a chat owned by another project", async () => {
    // Set up a second project (B) with its own chat agent and chat.
    const [projectB] = await testDb.db
      .insert(projects)
      .values({
        name: "tB",
        slug: `tB-${Date.now()}`,
        homeDir: "/tmp/orch8-chat-test-b",
      })
      .returning();
    await testDb.db.insert(agents).values({
      id: "chat",
      projectId: projectB.id,
      name: "Project Chat",
      role: "custom",
      model: "claude-sonnet-4-6",
      wakeOnOnDemand: true,
    });

    const fenced = [
      "```orch8-card",
      '{"kind":"confirm_create_task","summary":"Create T","payload":{"title":"T"}}',
      "```",
    ].join("\n");
    const adapter = makeMockAdapter(fenced);
    service = new ChatService(
      testDb.db,
      adapter as any,
      sessionMgr,
      broadcast,
      TEST_API_URL,
    );

    // Project A chat with a pending card.
    const chatA = await service.createChat({ projectId, agentId });
    await service.sendUserMessage(chatA.id, "make a task");
    const msgsA = await vi.waitFor(async () => {
      const list = await service.listMessages(chatA.id);
      expect(list.some((m) => m.role === "assistant")).toBe(true);
      return list;
    });
    const cardA = ((msgsA.find((m) => m.role === "assistant")!).cards as ExtractedCard[])[0];

    // Project B chat with its own pending card.
    const chatB = await service.createChat({ projectId: projectB.id, agentId: "chat" });
    await service.sendUserMessage(chatB.id, "make another task");
    const msgsB = await vi.waitFor(async () => {
      const list = await service.listMessages(chatB.id);
      expect(list.some((m) => m.role === "assistant")).toBe(true);
      return list;
    });
    const cardB = ((msgsB.find((m) => m.role === "assistant")!).cards as ExtractedCard[])[0];

    // Caller is authenticated for project A. Trying to decide a card
    // in project B's chat must fail as "not found" — NOT as an
    // auth error, to avoid leaking chat existence across projects.
    await expect(
      service.decideCard(chatB.id, cardB.id, "approved", "attacker", projectId),
    ).rejects.toThrow(/not found/i);

    // Also: trying to decide chat A's card while passing project B's
    // projectId must fail for the same reason.
    await expect(
      service.decideCard(chatA.id, cardA.id, "approved", "attacker", projectB.id),
    ).rejects.toThrow(/not found/i);

    // Project B's card must still be pending — untouched by the failed call.
    const msgsBAfter = await service.listMessages(chatB.id);
    const cardBAfter = ((msgsBAfter.find((m) => m.role === "assistant")!).cards as ExtractedCard[])[0];
    expect(cardBAfter.status).toBe("pending");
    expect(cardBAfter.decidedBy ?? null).toBeNull();
  });

  // ─── Startup recovery ─────────────────────────

  it("reapOrphanedChatMessages marks stuck streaming rows as error", async () => {
    service = new ChatService(
      testDb.db,
      makeMockAdapter("ok") as any,
      sessionMgr,
      broadcast,
      TEST_API_URL,
    );
    const chat = await service.createChat({ projectId, agentId });

    // Insert a row as if a prior daemon instance crashed mid-turn.
    const [stuck] = await testDb.db
      .insert(chatMessages)
      .values({
        chatId: chat.id,
        role: "assistant",
        content: "partial output so far",
        status: "streaming",
      })
      .returning();

    // Also insert a normal `complete` row to confirm it is NOT touched.
    const [ok] = await testDb.db
      .insert(chatMessages)
      .values({
        chatId: chat.id,
        role: "assistant",
        content: "fine",
        status: "complete",
      })
      .returning();

    const reaped = await service.reapOrphanedChatMessages();
    expect(reaped).toContain(stuck.id);
    expect(reaped).not.toContain(ok.id);

    const after = await testDb.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, stuck.id));
    expect(after[0].status).toBe("error");
    expect(after[0].content).toContain("partial output so far");
    expect(after[0].content).toContain("interrupted");

    // Untouched row remains complete.
    const okAfter = await testDb.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, ok.id));
    expect(okAfter[0].status).toBe("complete");
    expect(okAfter[0].content).toBe("fine");
  });

  it("reapOrphanedChatMessages is a no-op when no rows are stuck", async () => {
    service = new ChatService(
      testDb.db,
      makeMockAdapter("ok") as any,
      sessionMgr,
      broadcast,
      TEST_API_URL,
    );
    const reaped = await service.reapOrphanedChatMessages();
    expect(reaped).toEqual([]);
  });

  // ─── Session Invalidation ──────────────────────

  // ─── Pagination isolation ──────────────────────

  it("listMessages refuses a `before` cursor that belongs to a different chat", async () => {
    service = new ChatService(
      testDb.db,
      makeMockAdapter("ok") as any,
      sessionMgr,
      broadcast,
      TEST_API_URL,
    );

    const chatA = await service.createChat({ projectId, agentId, title: "A" });
    const chatB = await service.createChat({ projectId, agentId, title: "B" });

    // Two messages in chat A (oldest first). Force distinct createdAt
    // ordering by setting the timestamps explicitly — no sleep needed.
    const now = Date.now();
    const [msgA1] = await testDb.db
      .insert(chatMessages)
      .values({
        chatId: chatA.id,
        role: "user",
        content: "A1",
        createdAt: new Date(now),
      })
      .returning();
    await testDb.db
      .insert(chatMessages)
      .values({
        chatId: chatA.id,
        role: "assistant",
        content: "A2",
        createdAt: new Date(now + 1000),
      })
      .returning();

    // One message in chat B.
    await testDb.db
      .insert(chatMessages)
      .values({ chatId: chatB.id, role: "user", content: "B1" })
      .returning();

    // Baseline: chatB has exactly one message.
    const baselineB = await service.listMessages(chatB.id);
    expect(baselineB.map((m) => m.content)).toEqual(["B1"]);

    // Using msgA1 (from chat A) as a `before` cursor on chat B must
    // NOT filter chat B's results. Pre-fix, the anchor lookup returned
    // msgA1 (no chatId check), yielding 0 messages older than msgA1 in
    // chat B; post-fix, the anchor isn't recognised and the query falls
    // back to the full chat B list.
    const withForeignCursor = await service.listMessages(chatB.id, {
      before: msgA1.id,
    });
    expect(withForeignCursor.map((m) => m.content)).toEqual(["B1"]);
  });

  it("invalidateSession clears the taskSessions row for this chat", async () => {
    const adapter = makeMockAdapter("ok");
    service = new ChatService(
      testDb.db,
      adapter as any,
      sessionMgr,
      broadcast,
      TEST_API_URL,
    );
    const chat = await service.createChat({ projectId, agentId });

    // Seed a session row manually
    await sessionMgr.saveSession({
      agentId,
      projectId,
      taskKey: chat.id,
      adapterType: "claude_local",
      sessionId: "sess_old",
      cwd: "/tmp/orch8-chat-test",
    });

    const beforeClear = await sessionMgr.lookupSession({
      agentId,
      taskKey: chat.id,
      adapterType: "claude_local",
      cwd: "/tmp/orch8-chat-test",
    });
    expect(beforeClear?.sessionId).toBe("sess_old");

    await service.invalidateSession(chat.id);

    const afterClear = await sessionMgr.lookupSession({
      agentId,
      taskKey: chat.id,
      adapterType: "claude_local",
      cwd: "/tmp/orch8-chat-test",
    });
    expect(afterClear).toBeNull();
  });
});
