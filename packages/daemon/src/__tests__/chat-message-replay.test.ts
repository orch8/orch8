import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { projects, agents, chats, chatMessages, heartbeatRuns } from "@orch/shared/db";
import { ChatService } from "../services/chat.service.js";
import { BroadcastService } from "../services/broadcast.service.js";
import { SessionManager } from "../adapter/session-manager.js";
import type { ExtractedCard } from "@orch/shared";

describe("Chat message replay (end-to-end)", () => {
  let testDb: TestDb;
  let projectId: string;
  let service: ChatService;

  beforeAll(async () => {
    testDb = await setupTestDb();
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(chatMessages);
    await testDb.db.delete(chats);
    await testDb.db.delete(heartbeatRuns);
    await testDb.db.delete(agents);
    await testDb.db.delete(projects);

    const [project] = await testDb.db
      .insert(projects)
      .values({
        name: "replay",
        slug: `replay-${Date.now()}`,
        homeDir: "/tmp/orch8-chat-replay",
      })
      .returning();
    projectId = project.id;

    await testDb.db.insert(agents).values({
      id: "chat",
      projectId,
      name: "Project Chat",
      role: "custom",
      model: "claude-sonnet-4-6",
      wakeOnOnDemand: true,
    });
  });

  it("replays user → confirm card → approve → result card in order", async () => {
    let callCount = 0;

    // First call: agent emits a confirm card. Second call (after approval):
    // agent emits a result card acknowledging the creation.
    const adapter = {
      runAgent: vi.fn(async (_cfg: unknown, ctx: any) => {
        callCount++;
        const output = callCount === 1
          ? [
              "I'll create that task.",
              "```orch8-card",
              '{"kind":"confirm_create_task","summary":"Create T","payload":{"title":"T"}}',
              "```",
            ].join("\n")
          : [
              "Done.",
              "```orch8-card",
              '{"kind":"result_create_task","summary":"Task T created","payload":{"taskId":"task_new"}}',
              "```",
            ].join("\n");
        ctx.onEvent?.({
          type: "assistant",
          message: { content: [{ type: "text", text: output }] },
        });
        return {
          sessionId: `sess_${callCount}`,
          model: "claude-sonnet-4-6",
          result: output,
          usage: { input_tokens: 1, output_tokens: 1 },
          costUsd: 0,
          billingType: "api" as const,
          exitCode: 0,
          signal: null,
          error: null,
          errorCode: null,
          events: [],
        };
      }),
    };

    const broadcast = new BroadcastService(new Set<any>());
    const sessionMgr = new SessionManager(testDb.db);
    service = new ChatService(
      testDb.db,
      adapter as any,
      sessionMgr,
      broadcast,
      "http://localhost:3847",
    );

    const chat = await service.createChat({ projectId, agentId: "chat" });

    // Turn 1: user message → assistant emits confirm card
    await service.sendUserMessage(chat.id, "create task T");

    let msgs = await vi.waitFor(async () => {
      const list = await service.listMessages(chat.id);
      expect(list.map((m) => m.role)).toEqual(["user", "assistant"]);
      return list;
    });
    const assistant1 = msgs[1];
    const cards1 = assistant1.cards as ExtractedCard[];
    expect(cards1).toHaveLength(1);
    expect(cards1[0].kind).toBe("confirm_create_task");
    expect(cards1[0].status).toBe("pending");

    // Turn 2: user approves the card
    await service.decideCard(chat.id, cards1[0].id, "approved", "tester", projectId);

    msgs = await vi.waitFor(async () => {
      const list = await service.listMessages(chat.id);
      // Ordering: user, assistant(confirm), system(approval), assistant(result)
      expect(list.map((m) => m.role)).toEqual(["user", "assistant", "system", "assistant"]);
      return list;
    });
    const roles = msgs.map((m) => m.role);
    expect(roles).toEqual(["user", "assistant", "system", "assistant"]);

    const systemMsg = msgs[2];
    expect(systemMsg.content).toContain("approved");
    expect(systemMsg.content).toContain(cards1[0].id);

    const assistant2 = msgs[3];
    const cards2 = assistant2.cards as ExtractedCard[];
    expect(cards2[0].kind).toBe("result_create_task");

    // Adapter was called exactly twice — once for the user message, once for the approval follow-up.
    expect(adapter.runAgent).toHaveBeenCalledTimes(2);

    // Both runAgent calls should have used the same sessionKey (chatId)
    const firstCallCtx = adapter.runAgent.mock.calls[0][1] as { sessionKey?: string };
    const secondCallCtx = adapter.runAgent.mock.calls[1][1] as { sessionKey?: string };
    expect(firstCallCtx.sessionKey).toBe(chat.id);
    expect(secondCallCtx.sessionKey).toBe(chat.id);
  });
});
