import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Writable, Readable } from "node:stream";
import Fastify from "fastify";
import { projects, agents } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { authPlugin } from "../api/middleware/auth.js";
import { agentCreatorRoutes } from "../api/routes/agent-creator.js";
import { AgentCreatorService, type SpawnFn } from "../services/agent-creator.service.js";
import { AgentService } from "../services/agent.service.js";
import "../types.js";

function createMockProcess() {
  const stdin = new Writable({
    write(_chunk, _encoding, callback) { callback(); },
  });
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const proc = Object.assign(new EventEmitter(), {
    stdin,
    stdout,
    stderr,
    pid: 99999,
    kill: vi.fn(() => { proc.emit("close", 0, null); return true; }),
  });
  return proc;
}

describe("Agent Creator API Routes", () => {
  let testDb: TestDb;
  let projectId: string;
  let app: ReturnType<typeof Fastify>;
  let mockSpawn: SpawnFn;
  let lastMockProcess: ReturnType<typeof createMockProcess>;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "AC Routes",
      slug: "ac-routes",
      homeDir: "/tmp/acr",
      worktreeDir: "/tmp/acr-wt",
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values({
      id: "existing-agent",
      projectId,
      name: "Existing Agent",
      role: "custom",
    });
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    mockSpawn = vi.fn(() => {
      lastMockProcess = createMockProcess();
      return lastMockProcess as unknown as ReturnType<SpawnFn>;
    }) as unknown as SpawnFn;

    const creatorService = new AgentCreatorService(
      testDb.db,
      () => {},
      mockSpawn,
    );

    const agentService = new AgentService(testDb.db);

    app = Fastify();
    app.decorate("db", testDb.db);
    app.decorate("agentCreatorService", creatorService);
    app.decorate("agentService", agentService);
    app.register(authPlugin);
    app.register(agentCreatorRoutes);
    await app.ready();
  });

  describe("POST /api/agent-creator/:projectId/start", () => {
    it("starts a session and returns sessionId", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/api/agent-creator/${projectId}/start`,
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.sessionId).toBeTruthy();
    });

    it("rejects duplicate session for same project", async () => {
      await app.inject({
        method: "POST",
        url: `/api/agent-creator/${projectId}/start`,
        headers: { "x-project-id": projectId },
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/agent-creator/${projectId}/start`,
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(409);
    });
  });

  describe("POST /api/agent-creator/:sessionId/message", () => {
    it("sends a message to active session", async () => {
      const startRes = await app.inject({
        method: "POST",
        url: `/api/agent-creator/${projectId}/start`,
        headers: { "x-project-id": projectId },
      });
      const { sessionId } = JSON.parse(startRes.body);

      // Complete first turn so sendMessage can proceed
      lastMockProcess.emit("close", 0, null);

      const response = await app.inject({
        method: "POST",
        url: `/api/agent-creator/${sessionId}/message`,
        headers: { "x-project-id": projectId },
        payload: { content: "I want a code reviewer" },
      });

      expect(response.statusCode).toBe(200);
    });

    it("rejects missing content", async () => {
      const startRes = await app.inject({
        method: "POST",
        url: `/api/agent-creator/${projectId}/start`,
        headers: { "x-project-id": projectId },
      });
      const { sessionId } = JSON.parse(startRes.body);

      const response = await app.inject({
        method: "POST",
        url: `/api/agent-creator/${sessionId}/message`,
        headers: { "x-project-id": projectId },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /api/agent-creator/:sessionId/confirm", () => {
    it("returns 422 when no config found", async () => {
      const startRes = await app.inject({
        method: "POST",
        url: `/api/agent-creator/${projectId}/start`,
        headers: { "x-project-id": projectId },
      });
      const { sessionId } = JSON.parse(startRes.body);
      lastMockProcess.emit("close", 0, null);

      const response = await app.inject({
        method: "POST",
        url: `/api/agent-creator/${sessionId}/confirm`,
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(422);
    });
  });

  describe("POST /api/agent-creator/:sessionId/cancel", () => {
    it("cancels active session", async () => {
      const startRes = await app.inject({
        method: "POST",
        url: `/api/agent-creator/${projectId}/start`,
        headers: { "x-project-id": projectId },
      });
      const { sessionId } = JSON.parse(startRes.body);

      const response = await app.inject({
        method: "POST",
        url: `/api/agent-creator/${sessionId}/cancel`,
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(200);
    });

    it("returns 404 for nonexistent session", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/api/agent-creator/nonexistent/cancel`,
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
