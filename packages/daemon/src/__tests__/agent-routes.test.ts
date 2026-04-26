import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import { projects, agents, wakeupRequests } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { decorateTestApp } from "./helpers/test-app.js";
import { authPlugin } from "../api/middleware/auth.js";
import { agentRoutes } from "../api/routes/agents.js";
import { vi } from "vitest";
import { AgentService } from "../services/agent.service.js";
import { HeartbeatService } from "../services/heartbeat.service.js";
import { BroadcastService } from "../services/broadcast.service.js";
import { hashAgentToken } from "../api/middleware/agent-token.js";
import "../types.js";

describe("Agent API Routes", () => {
  let testDb: TestDb;
  let projectId: string;
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Agent Route Test",
      slug: "agent-route-test",
      homeDir: "/tmp/agent-routes",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(wakeupRequests);
    await testDb.db.delete(agents);

    app = Fastify();
    decorateTestApp(app, testDb.db);

    const agentService = new AgentService(testDb.db);
    app.decorate("agentService", agentService);

    const sockets = new Set() as unknown as Set<import("ws").WebSocket>;
    const broadcastService = new BroadcastService(sockets);
    const heartbeatService = new HeartbeatService(testDb.db, broadcastService);
    app.decorate("heartbeatService", heartbeatService);
    app.decorate("taskService", { list: vi.fn().mockResolvedValue([]) });

    app.register(authPlugin, { allowLocalhostAdmin: true });
    app.register(agentRoutes);
    await app.ready();
  });

  describe("POST /api/agents", () => {
    it("creates an agent (admin)", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/agents",
        headers: { "x-project-id": projectId },
        payload: {
          id: "fe-eng",
          projectId,
          name: "Frontend Engineer",
          role: "engineer",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.id).toBe("fe-eng");
      expect(body.role).toBe("engineer");
      expect(body.status).toBe("active");
      expect(body.rawToken).toEqual(expect.any(String));
      expect(body.rawToken).toHaveLength(32);

      await app.close();
    });

    it("returns 400 for invalid payload", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/agents",
        headers: { "x-project-id": projectId },
        payload: { name: "Missing fields" },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });
  });

  describe("GET /api/agents", () => {
    it("lists agents for a project", async () => {
      await testDb.db.insert(agents).values([
        { id: "a1", projectId, name: "A1", role: "engineer" },
        { id: "a2", projectId, name: "A2", role: "qa" },
      ]);

      const response = await app.inject({
        method: "GET",
        url: `/api/agents?projectId=${projectId}`,
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(2);
      expect(body[0]).not.toHaveProperty("rawToken");
      expect(body[1]).not.toHaveProperty("rawToken");

      await app.close();
    });

    it("filters by role", async () => {
      await testDb.db.insert(agents).values([
        { id: "eng-1", projectId, name: "Eng", role: "engineer" },
        { id: "qa-1", projectId, name: "QA", role: "qa" },
      ]);

      const response = await app.inject({
        method: "GET",
        url: `/api/agents?projectId=${projectId}&role=qa`,
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(1);
      expect(body[0].role).toBe("qa");
      expect(body[0]).not.toHaveProperty("rawToken");

      await app.close();
    });
  });

  describe("GET /api/agents/:id", () => {
    it("returns agent by id", async () => {
      await testDb.db.insert(agents).values({
        id: "get-test",
        projectId,
        name: "Get Test",
        role: "engineer",
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/agents/get-test",
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe("get-test");
      expect(body).not.toHaveProperty("rawToken");

      await app.close();
    });

    it("returns 404 for nonexistent agent", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/agents/nope",
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });
  });

  describe("PATCH /api/agents/:id", () => {
    it("updates agent fields", async () => {
      await testDb.db.insert(agents).values({
        id: "patch-test",
        projectId,
        name: "Original",
        role: "engineer",
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/api/agents/patch-test",
        headers: { "x-project-id": projectId },
        payload: { name: "Updated", maxTurns: 50 },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.name).toBe("Updated");
      expect(body.maxTurns).toBe(50);

      await app.close();
    });
  });

  describe("POST /api/agents/:id/rotate-token", () => {
    it("rotates an agent token and returns the new raw token", async () => {
      const oldRawToken = "old-token";
      await testDb.db.insert(agents).values({
        id: "rotate-test",
        projectId,
        name: "Rotate Test",
        role: "engineer",
        agentTokenHash: hashAgentToken(oldRawToken),
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/agents/rotate-test/rotate-token",
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe("rotate-test");
      expect(body.rawToken).toEqual(expect.any(String));
      expect(body.rawToken).not.toBe(oldRawToken);

      const [agent] = await testDb.db.select().from(agents);
      expect(agent.agentTokenHash).toBe(hashAgentToken(body.rawToken));

      await app.close();
    });

    it("returns 404 when rotating a nonexistent agent token", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/agents/missing/rotate-token",
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });
  });

  describe("POST /api/agents/:id/pause", () => {
    it("pauses an active agent", async () => {
      await testDb.db.insert(agents).values({
        id: "pause-test",
        projectId,
        name: "Pause Test",
        role: "engineer",
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/agents/pause-test/pause",
        headers: { "x-project-id": projectId },
        payload: { reason: "maintenance" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("paused");
      expect(body.pauseReason).toBe("maintenance");

      await app.close();
    });
  });

  describe("POST /api/agents/:id/resume", () => {
    it("resumes a paused agent", async () => {
      await testDb.db.insert(agents).values({
        id: "resume-test",
        projectId,
        name: "Resume Test",
        role: "engineer",
        status: "paused",
        pauseReason: "maintenance",
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/agents/resume-test/resume",
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("active");
      expect(body.pauseReason).toBeNull();

      await app.close();
    });
  });

  describe("POST /api/agents/:id/wake", () => {
    it("enqueues a wakeup request", async () => {
      await testDb.db.insert(agents).values({
        id: "wake-test",
        projectId,
        name: "Wake Test",
        role: "engineer",
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/agents/wake-test/wake",
        headers: { "x-project-id": projectId },
        payload: { reason: "Manual trigger" },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.agentId).toBe("wake-test");
      expect(body.source).toBe("on_demand");
      expect(body.status).toBe("queued");

      await app.close();
    });
  });
});
