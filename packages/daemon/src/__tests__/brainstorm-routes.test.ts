import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Writable, Readable } from "node:stream";
import Fastify from "fastify";
import { projects, tasks, agents } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { authPlugin } from "../api/middleware/auth.js";
import { brainstormRoutes } from "../api/routes/brainstorm.js";
import { BrainstormService, type SpawnFn } from "../services/brainstorm.service.js";
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

describe("Brainstorm API Routes", () => {
  let testDb: TestDb;
  let projectId: string;
  let app: ReturnType<typeof Fastify>;
  let mockSpawn: SpawnFn;

  beforeAll(async () => {
    testDb = await setupTestDb();

    mockSpawn = vi.fn(() => createMockProcess()) as unknown as SpawnFn;

    const [project] = await testDb.db.insert(projects).values({
      name: "BS Routes",
      slug: "bs-routes",
      homeDir: "/tmp/bsr",
      worktreeDir: "/tmp/bsr-wt",
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values({
      id: "bs-agent",
      projectId,
      name: "BS Agent",
      role: "custom",
    });
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(tasks);

    const brainstormService = new BrainstormService(
      testDb.db,
      () => {},
      mockSpawn,
    );

    app = Fastify();
    app.decorate("db", testDb.db);
    app.decorate("brainstormService", brainstormService);
    app.register(authPlugin);
    app.register(brainstormRoutes);
    await app.ready();
  });

  describe("POST /api/brainstorm/:taskId/start", () => {
    it("starts a brainstorm session", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Start BS",
        taskType: "brainstorm",
        brainstormStatus: "active",
        assignee: "bs-agent",
      }).returning();

      const response = await app.inject({
        method: "POST",
        url: `/api/brainstorm/${task.id}/start`,
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
    });

    it("rejects starting already-active session", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Double start",
        taskType: "brainstorm",
        brainstormStatus: "active",
        assignee: "bs-agent",
      }).returning();

      await app.inject({
        method: "POST",
        url: `/api/brainstorm/${task.id}/start`,
        headers: { "x-project-id": projectId },
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/brainstorm/${task.id}/start`,
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(409);
    });
  });

  describe("POST /api/brainstorm/:taskId/message", () => {
    it("sends a message to active session", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Send msg",
        taskType: "brainstorm",
        brainstormStatus: "active",
        assignee: "bs-agent",
      }).returning();

      await app.inject({
        method: "POST",
        url: `/api/brainstorm/${task.id}/start`,
        headers: { "x-project-id": projectId },
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/brainstorm/${task.id}/message`,
        headers: { "x-project-id": projectId },
        payload: { content: "Hello agent" },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("POST /api/brainstorm/:taskId/ready", () => {
    it("marks session as ready", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Ready",
        taskType: "brainstorm",
        brainstormStatus: "active",
        assignee: "bs-agent",
      }).returning();

      await app.inject({
        method: "POST",
        url: `/api/brainstorm/${task.id}/start`,
        headers: { "x-project-id": projectId },
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/brainstorm/${task.id}/ready`,
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("POST /api/brainstorm/:taskId/kill", () => {
    it("kills active session", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Kill",
        taskType: "brainstorm",
        brainstormStatus: "active",
        assignee: "bs-agent",
      }).returning();

      await app.inject({
        method: "POST",
        url: `/api/brainstorm/${task.id}/start`,
        headers: { "x-project-id": projectId },
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/brainstorm/${task.id}/kill`,
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("GET /api/brainstorm/:taskId/transcript", () => {
    it("returns transcript from stored task", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Transcript",
        taskType: "brainstorm",
        brainstormStatus: "ready",
        brainstormTranscript: "The conversation...",
      }).returning();

      const response = await app.inject({
        method: "GET",
        url: `/api/brainstorm/${task.id}/transcript`,
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.transcript).toBe("The conversation...");
    });
  });
});
