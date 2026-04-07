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
    runAgent: vi.fn(async (_cfg: unknown, ctx: any, _prompts: unknown) => {
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
        worktreeDir: "/tmp/orch8-chat-test/worktrees",
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
        promptTemplate: "{{context.userMessage}}",
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

    // Wait for the async turn to finish
    await new Promise((r) => setTimeout(r, 100));
    expect(adapter.runAgent).toHaveBeenCalledTimes(1);

    const msgs = await service.listMessages(chat.id);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(msgs[1].content).toContain("Thanks for the message.");
    expect(msgs[1].runId).toBeTruthy();
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
    await new Promise((r) => setTimeout(r, 100));

    const msgs = await service.listMessages(chat.id);
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
    await new Promise((r) => setTimeout(r, 100));

    const refreshed = await service.getChat(chat.id);
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
    await new Promise((r) => setTimeout(r, 100));

    const msgs = await service.listMessages(chat.id);
    const assistant = msgs.find((m) => m.role === "assistant")!;
    const card = (assistant.cards as ExtractedCard[])[0];

    await service.decideCard(chat.id, card.id, "approved", "test-user");
    await new Promise((r) => setTimeout(r, 100));

    const refreshedMsgs = await service.listMessages(chat.id);
    const systemMsgs = refreshedMsgs.filter((m) => m.role === "system");
    expect(systemMsgs).toHaveLength(1);
    expect(systemMsgs[0].content).toContain("approved");
    expect(systemMsgs[0].content).toContain(card.id);

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
    await new Promise((r) => setTimeout(r, 100));

    const msgs = await service.listMessages(chat.id);
    const assistant = msgs.find((m) => m.role === "assistant")!;
    const card = (assistant.cards as ExtractedCard[])[0];

    await service.decideCard(chat.id, card.id, "approved", "user-1");
    const firstDecision = (await testDb.db.select().from(chatMessages).where(eq(chatMessages.id, assistant.id)))[0];
    const firstDecidedAt = (firstDecision.cards as ExtractedCard[])[0].decidedAt;

    // Second call should be a no-op (same decidedAt preserved)
    await service.decideCard(chat.id, card.id, "approved", "user-2");
    const secondDecision = (await testDb.db.select().from(chatMessages).where(eq(chatMessages.id, assistant.id)))[0];
    expect((secondDecision.cards as ExtractedCard[])[0].decidedAt).toBe(firstDecidedAt);
    expect((secondDecision.cards as ExtractedCard[])[0].decidedBy).toBe("user-1");
  });

  // ─── Session Invalidation ──────────────────────

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
