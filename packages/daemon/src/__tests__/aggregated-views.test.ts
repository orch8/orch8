import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import { projects, agents, heartbeatRuns } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { authPlugin } from "../api/middleware/auth.js";
import { runRoutes } from "../api/routes/runs.js";
import { costRoutes } from "../api/routes/cost.js";
import "../types.js";

describe("Aggregated Cross-Project Views", () => {
  let testDb: TestDb;
  let projAId: string;
  let projBId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(heartbeatRuns);
    await testDb.db.delete(agents);
    await testDb.db.delete(projects);

    const [projA] = await testDb.db
      .insert(projects)
      .values({ name: "A", slug: "a", homeDir: "/a", worktreeDir: "/a-wt" })
      .returning();
    projAId = projA.id;

    const [projB] = await testDb.db
      .insert(projects)
      .values({ name: "B", slug: "b", homeDir: "/b", worktreeDir: "/b-wt" })
      .returning();
    projBId = projB.id;

    // Create agents for run FK
    await testDb.db.insert(agents).values([
      { id: "eng-a", projectId: projAId, name: "Eng A", role: "engineer" },
      { id: "eng-b", projectId: projBId, name: "Eng B", role: "engineer" },
    ]);
  });

  describe("GET /api/runs without projectId (admin)", () => {
    it("returns runs across all projects", async () => {
      await testDb.db.insert(heartbeatRuns).values([
        {
          agentId: "eng-a",
          projectId: projAId,
          invocationSource: "on_demand",
          status: "succeeded",
          costUsd: 1.00,
        },
        {
          agentId: "eng-b",
          projectId: projBId,
          invocationSource: "on_demand",
          status: "succeeded",
          costUsd: 2.00,
        },
      ]);

      const app = Fastify();
      app.decorate("db", testDb.db);
      app.register(authPlugin);
      app.register(runRoutes);
      await app.ready();

      // Admin request (no x-agent-id header)
      const res = await app.inject({ method: "GET", url: "/api/runs" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(2);
      await app.close();
    });
  });

  describe("GET /api/cost/summary without projectId (admin)", () => {
    it("returns cost aggregated across all projects", async () => {
      await testDb.db.insert(heartbeatRuns).values([
        {
          agentId: "eng-a",
          projectId: projAId,
          invocationSource: "on_demand",
          status: "succeeded",
          costUsd: 1.50,
        },
        {
          agentId: "eng-b",
          projectId: projBId,
          invocationSource: "on_demand",
          status: "succeeded",
          costUsd: 2.50,
        },
      ]);

      const app = Fastify();
      app.decorate("db", testDb.db);
      app.register(authPlugin);
      app.register(costRoutes);
      await app.ready();

      const res = await app.inject({ method: "GET", url: "/api/cost/summary" });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(4);
      expect(body.byAgent).toHaveLength(2);
      await app.close();
    });
  });
});
