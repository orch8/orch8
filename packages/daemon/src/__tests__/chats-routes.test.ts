import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { projects, agents, chats, chatMessages, heartbeatRuns } from "@orch/shared/db";
import { ChatService } from "../services/chat.service.js";
import { BroadcastService } from "../services/broadcast.service.js";
import { SessionManager } from "../adapter/session-manager.js";
import { chatsRoutes } from "../api/routes/chats.js";
import { authPlugin } from "../api/middleware/auth.js";
import type { ExtractedCard } from "@orch/shared";

function makeMockAdapter() {
  return {
    runAgent: vi.fn(async (_cfg: unknown, ctx: any) => {
      if (typeof ctx.onEvent === "function") {
        ctx.onEvent({
          type: "assistant",
          message: { content: [{ type: "text", text: "mock reply" }] },
        });
      }
      return {
        sessionId: "sess_1",
        model: "claude-sonnet-4-6",
        result: "mock reply",
        usage: { input_tokens: 1, output_tokens: 1 },
        costUsd: 0,
        billingType: "api",
        exitCode: 0,
        signal: null,
        error: null,
        errorCode: null,
        events: [],
      };
    }),
  };
}

describe("Chat API Routes", () => {
  let testDb: TestDb;
  let projectId: string;
  let app: ReturnType<typeof Fastify>;

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
        name: "t",
        slug: `t-${Date.now()}`,
        homeDir: "/tmp/orch8-chat-routes-test",
        worktreeDir: "/tmp/orch8-chat-routes-test/worktrees",
      })
      .returning();
    projectId = project.id;

    await testDb.db.insert(agents).values({
      id: "chat",
      projectId,
      name: "Project Chat",
      role: "custom",
      model: "claude-sonnet-4-6",
      promptTemplate: "{{context.userMessage}}",
      wakeOnOnDemand: true,
    });

    const broadcast = new BroadcastService(new Set<any>());
    const sessionMgr = new SessionManager(testDb.db);
    const chatService = new ChatService(
      testDb.db,
      makeMockAdapter() as any,
      sessionMgr,
      broadcast,
      "http://localhost:3847",
    );

    app = Fastify();
    app.decorate("db", testDb.db);
    app.decorate("chatService", chatService);
    app.register(authPlugin, { allowLocalhostAdmin: true });
    app.register(chatsRoutes);
    await app.ready();
  });

  // ─── Chat CRUD ──────────────────────────────────

  it("POST /api/projects/:projectId/chats creates a chat", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/chats`,
      headers: { "x-project-id": projectId },
      payload: { projectId, title: "My Chat" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toMatch(/^chat_/);
    expect(body.title).toBe("My Chat");
    expect(body.agentId).toBe("chat");
  });

  it("GET /api/projects/:projectId/chats lists chats", async () => {
    await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/chats`,
      headers: { "x-project-id": projectId },
      payload: { projectId, title: "A" },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/chats`,
      headers: { "x-project-id": projectId },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("A");
  });

  it("PATCH /api/chats/:chatId renames a chat", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/chats`,
      headers: { "x-project-id": projectId },
      payload: { projectId },
    });
    const chat = JSON.parse(createRes.body);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/chats/${chat.id}`,
      headers: { "x-project-id": projectId },
      payload: { title: "Renamed" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).title).toBe("Renamed");
  });

  it("DELETE /api/chats/:chatId soft-deletes", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/chats`,
      headers: { "x-project-id": projectId },
      payload: { projectId },
    });
    const chat = JSON.parse(createRes.body);

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/chats/${chat.id}`,
      headers: { "x-project-id": projectId },
    });
    expect(delRes.statusCode).toBe(204);

    const listRes = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/chats`,
      headers: { "x-project-id": projectId },
    });
    expect(JSON.parse(listRes.body)).toHaveLength(0);
  });

  // ─── Messages ──────────────────────────────────

  it("POST /api/chats/:chatId/messages returns 202 with the user row", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/chats`,
      headers: { "x-project-id": projectId },
      payload: { projectId },
    });
    const chat = JSON.parse(createRes.body);

    const res = await app.inject({
      method: "POST",
      url: `/api/chats/${chat.id}/messages`,
      headers: { "x-project-id": projectId },
      payload: { content: "hello" },
    });
    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.role).toBe("user");
    expect(body.content).toBe("hello");

    // Poll until the fire-and-forget assistant turn has written its row.
    const msgs = await vi.waitFor(async () => {
      const msgsRes = await app.inject({
        method: "GET",
        url: `/api/chats/${chat.id}/messages`,
        headers: { "x-project-id": projectId },
      });
      const parsed = JSON.parse(msgsRes.body);
      expect(parsed.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
      return parsed;
    });
    expect(msgs.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
  });

  it("POST /api/chats/:chatId/messages rejects empty content", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/chats`,
      headers: { "x-project-id": projectId },
      payload: { projectId },
    });
    const chat = JSON.parse(createRes.body);

    const res = await app.inject({
      method: "POST",
      url: `/api/chats/${chat.id}/messages`,
      headers: { "x-project-id": projectId },
      payload: { content: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("validation_error");
  });

  // ─── Card Decisions ───────────────────────────

  it("POST /api/chats/:chatId/cards/:cardId/decision approves a card", async () => {
    // Stub the adapter to emit a fenced card
    const broadcast = new BroadcastService(new Set<any>());
    const sessionMgr = new SessionManager(testDb.db);
    const adapter = {
      runAgent: vi.fn(async (_cfg: unknown, ctx: any) => {
        const fenced = [
          "```orch8-card",
          '{"kind":"confirm_create_task","summary":"Create T","payload":{"title":"T"}}',
          "```",
        ].join("\n");
        ctx.onEvent?.({
          type: "assistant",
          message: { content: [{ type: "text", text: fenced }] },
        });
        return {
          sessionId: "sess_2",
          model: "claude-sonnet-4-6",
          result: fenced,
          usage: { input_tokens: 1, output_tokens: 1 },
          costUsd: 0,
          billingType: "api",
          exitCode: 0,
          signal: null,
          error: null,
          errorCode: null,
          events: [],
        };
      }),
    };
    const chatService = new ChatService(
      testDb.db,
      adapter as any,
      sessionMgr,
      broadcast,
      "http://localhost:3847",
    );

    const localApp = Fastify();
    localApp.decorate("db", testDb.db);
    localApp.decorate("chatService", chatService);
    localApp.register(authPlugin, { allowLocalhostAdmin: true });
    localApp.register(chatsRoutes);
    await localApp.ready();

    const createRes = await localApp.inject({
      method: "POST",
      url: `/api/projects/${projectId}/chats`,
      headers: { "x-project-id": projectId },
      payload: { projectId },
    });
    const chat = JSON.parse(createRes.body);

    await localApp.inject({
      method: "POST",
      url: `/api/chats/${chat.id}/messages`,
      headers: { "x-project-id": projectId },
      payload: { content: "create task" },
    });

    // Poll until the assistant row has landed.
    const msgs = await vi.waitFor(async () => {
      const msgsRes = await localApp.inject({
        method: "GET",
        url: `/api/chats/${chat.id}/messages`,
        headers: { "x-project-id": projectId },
      });
      const parsed = JSON.parse(msgsRes.body);
      expect(parsed.some((m: { role: string }) => m.role === "assistant")).toBe(true);
      return parsed;
    });
    const assistant = msgs.find((m: { role: string }) => m.role === "assistant");
    const card: ExtractedCard = assistant.cards[0];

    const decisionRes = await localApp.inject({
      method: "POST",
      url: `/api/chats/${chat.id}/cards/${card.id}/decision`,
      headers: { "x-project-id": projectId },
      payload: { decision: "approved", actor: "integration-test" },
    });
    expect(decisionRes.statusCode).toBe(200);
    const updated = JSON.parse(decisionRes.body);
    expect((updated.cards as ExtractedCard[])[0].status).toBe("approved");
    expect((updated.cards as ExtractedCard[])[0].decidedBy).toBe("integration-test");

    await localApp.close();
  });

  it("POST /api/projects/:projectId/chats with seedMessage inserts assistant message", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/chats`,
      headers: { "x-project-id": projectId },
      payload: { projectId, title: "Setup", seedMessage: "Hello! Tell me what you're building." },
    });
    expect(res.statusCode).toBe(201);
    const chat = JSON.parse(res.body);

    const msgRes = await app.inject({
      method: "GET",
      url: `/api/chats/${chat.id}/messages`,
      headers: { "x-project-id": projectId },
    });
    expect(msgRes.statusCode).toBe(200);
    const messages = JSON.parse(msgRes.body);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("assistant");
    expect(messages[0].content).toBe("Hello! Tell me what you're building.");
    expect(messages[0].status).toBe("complete");
  });
});
