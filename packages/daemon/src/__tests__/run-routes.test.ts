import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import { projects, agents, heartbeatRuns } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { runRoutes } from "../api/routes/runs.js";
import { authPlugin } from "../api/middleware/auth.js";

describe("Run Routes", () => {
  let testDb: TestDb;
  let app: ReturnType<typeof Fastify>;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Run Routes Test",
      slug: "run-routes-test",
      homeDir: "/tmp/run-routes",
      worktreeDir: "/tmp/run-wt",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(heartbeatRuns);
    await testDb.db.delete(agents);

    app = Fastify();
    app.decorate("db", testDb.db);
    app.register(authPlugin, { allowLocalhostAdmin: true });
    app.register(runRoutes);
  });

  describe("GET /api/runs", () => {
    it("lists runs filtered by projectId", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
      });
      await testDb.db.insert(heartbeatRuns).values([
        { agentId: "eng-1", projectId, invocationSource: "on_demand", status: "queued" },
        { agentId: "eng-1", projectId, invocationSource: "timer", status: "running", startedAt: new Date() },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/api/runs",
        headers: { "x-project-id": projectId },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(2);
    });

    it("filters by agentId", async () => {
      await testDb.db.insert(agents).values([
        { id: "eng-1", projectId, name: "Eng 1", role: "engineer" },
        { id: "eng-2", projectId, name: "Eng 2", role: "engineer" },
      ]);
      await testDb.db.insert(heartbeatRuns).values([
        { agentId: "eng-1", projectId, invocationSource: "on_demand", status: "queued" },
        { agentId: "eng-2", projectId, invocationSource: "on_demand", status: "queued" },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/api/runs?agentId=eng-1",
        headers: { "x-project-id": projectId },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(1);
      expect(body[0].agentId).toBe("eng-1");
    });

    it("filters by status", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
      });
      await testDb.db.insert(heartbeatRuns).values([
        { agentId: "eng-1", projectId, invocationSource: "on_demand", status: "queued" },
        { agentId: "eng-1", projectId, invocationSource: "on_demand", status: "succeeded", finishedAt: new Date() },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/api/runs?status=queued",
        headers: { "x-project-id": projectId },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(1);
      expect(body[0].status).toBe("queued");
    });
  });

  describe("GET /api/runs/:id", () => {
    it("returns a single run", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
      });
      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1", projectId, invocationSource: "on_demand", status: "queued",
      }).returning();

      const res = await app.inject({
        method: "GET",
        url: `/api/runs/${run.id}`,
        headers: { "x-project-id": projectId },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(run.id);
    });

    it("returns 404 for nonexistent run", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/runs/run_nonexistent",
        headers: { "x-project-id": projectId },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
