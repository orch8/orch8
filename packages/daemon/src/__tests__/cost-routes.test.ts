// packages/daemon/src/__tests__/cost-routes.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import { projects, agents, tasks, heartbeatRuns } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { decorateTestApp } from "./helpers/test-app.js";
import { authPlugin } from "../api/middleware/auth.js";
import { costRoutes } from "../api/routes/cost.js";
import "../types.js";

describe("Cost Routes", () => {
  let testDb: TestDb;
  let app: ReturnType<typeof Fastify>;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Cost Test",
      slug: "cost-test",
      homeDir: "/tmp/cost",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(heartbeatRuns);
    await testDb.db.delete(tasks);
    await testDb.db.delete(agents);

    await testDb.db.insert(agents).values([
      { id: "eng-1", projectId, name: "Eng 1", role: "engineer" },
      { id: "eng-2", projectId, name: "Eng 2", role: "engineer" },
    ]);

    app = Fastify();
    decorateTestApp(app, testDb.db);
    app.register(authPlugin, { allowLocalhostAdmin: true });
    app.register(costRoutes);
    await app.ready();
  });

  describe("GET /api/cost/summary", () => {
    it("returns aggregated cost by agent", async () => {
      await testDb.db.insert(heartbeatRuns).values([
        { agentId: "eng-1", projectId, invocationSource: "on_demand", status: "succeeded", costUsd: 0.05, finishedAt: new Date() },
        { agentId: "eng-1", projectId, invocationSource: "on_demand", status: "succeeded", costUsd: 0.10, finishedAt: new Date() },
        { agentId: "eng-2", projectId, invocationSource: "on_demand", status: "succeeded", costUsd: 0.20, finishedAt: new Date() },
      ]);

      const res = await app.inject({
        method: "GET",
        url: `/api/cost/summary?projectId=${projectId}`,
        headers: { "x-project-id": projectId },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBeCloseTo(0.35, 2);
      expect(body.byAgent).toHaveLength(2);
    });
  });

  describe("GET /api/cost/timeseries", () => {
    it("returns daily cost data", async () => {
      const now = new Date();
      await testDb.db.insert(heartbeatRuns).values([
        { agentId: "eng-1", projectId, invocationSource: "on_demand", status: "succeeded", costUsd: 0.10, finishedAt: now },
      ]);

      const res = await app.inject({
        method: "GET",
        url: `/api/cost/timeseries?projectId=${projectId}&days=7`,
        headers: { "x-project-id": projectId },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe("GET /api/cost/task/:taskId", () => {
    it("returns per-task cost breakdown", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId, title: "Costed task", taskType: "quick",
      }).returning();

      await testDb.db.insert(heartbeatRuns).values([
        { agentId: "eng-1", projectId, taskId: task.id, invocationSource: "on_demand", status: "succeeded", costUsd: 0.15, finishedAt: new Date() },
        { agentId: "eng-1", projectId, taskId: task.id, invocationSource: "on_demand", status: "succeeded", costUsd: 0.05, finishedAt: new Date() },
      ]);

      const res = await app.inject({
        method: "GET",
        url: `/api/cost/task/${task.id}`,
        headers: { "x-project-id": projectId },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBeCloseTo(0.20, 2);
      expect(body.runs).toHaveLength(2);
    });
  });
});
