import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import { projects, agents, activityLog } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { authPlugin } from "../api/middleware/auth.js";
import { activityRoutes } from "../api/routes/activity.js";
import "../types.js";

describe("Activity Log Routes", () => {
  let testDb: TestDb;
  let app: ReturnType<typeof Fastify>;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Activity Test",
      slug: "activity-test",
      homeDir: "/tmp/activity",
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values({
      id: "eng-1", projectId, name: "Engineer", role: "engineer",
    });
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(activityLog);

    app = Fastify();
    app.decorate("db", testDb.db);
    app.register(authPlugin, { allowLocalhostAdmin: true });
    app.register(activityRoutes);
    await app.ready();
  });

  describe("POST /api/log", () => {
    it("appends a log entry", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/log",
        headers: { "x-agent-id": "eng-1", "x-project-id": projectId },
        payload: {
          projectId,
          message: "Started working on auth fix",
          level: "info",
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().message).toBe("Started working on auth fix");
    });

    it("auto-fills agentId from request context", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/log",
        headers: { "x-agent-id": "eng-1", "x-project-id": projectId },
        payload: {
          projectId,
          message: "Agent action",
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().agentId).toBe("eng-1");
    });
  });

  describe("GET /api/log", () => {
    it("lists log entries with pagination", async () => {
      await testDb.db.insert(activityLog).values([
        { projectId, agentId: "eng-1", message: "First", level: "info" },
        { projectId, agentId: "eng-1", message: "Second", level: "warn" },
        { projectId, agentId: "eng-1", message: "Third", level: "error" },
      ]);

      const res = await app.inject({
        method: "GET",
        url: `/api/log?projectId=${projectId}&limit=2`,
        headers: { "x-project-id": projectId },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(2);
    });

    it("filters by level", async () => {
      await testDb.db.insert(activityLog).values([
        { projectId, message: "Info entry", level: "info" },
        { projectId, message: "Error entry", level: "error" },
      ]);

      const res = await app.inject({
        method: "GET",
        url: `/api/log?projectId=${projectId}&level=error`,
        headers: { "x-project-id": projectId },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(1);
      expect(body[0].message).toBe("Error entry");
    });

    it("filters by agentId", async () => {
      await testDb.db.insert(activityLog).values([
        { projectId, agentId: "eng-1", message: "Agent 1 entry", level: "info" },
        { projectId, agentId: "eng-2", message: "Agent 2 entry", level: "info" },
      ]);

      const res = await app.inject({
        method: "GET",
        url: `/api/log?projectId=${projectId}&agentId=eng-1`,
        headers: { "x-project-id": projectId },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(1);
      expect(body[0].agentId).toBe("eng-1");
    });
  });
});
