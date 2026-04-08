import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { projects, agents, heartbeatRuns } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { authPlugin } from "../api/middleware/auth.js";
import { runRoutes } from "../api/routes/runs.js";
import { costRoutes } from "../api/routes/cost.js";
import "../types.js";

describe("Aggregated Cross-Project Views", () => {
  let testDb: TestDb;
  let app: FastifyInstance;
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

    app = Fastify();
    app.decorate("db", testDb.db);
    app.register(authPlugin);
    app.register(runRoutes);
    app.register(costRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
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

      // Admin request (no x-agent-id header)
      const res = await app.inject({ method: "GET", url: "/api/runs" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(2);
    });

    it("filters by projectId when admin provides header", async () => {
      await testDb.db.insert(heartbeatRuns).values([
        { agentId: "eng-a", projectId: projAId, status: "succeeded", costUsd: 1.00, invocationSource: "on_demand" },
        { agentId: "eng-b", projectId: projBId, status: "succeeded", costUsd: 2.00, invocationSource: "on_demand" },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/api/runs",
        headers: { "x-project-id": projAId },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(1);
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

      const res = await app.inject({ method: "GET", url: "/api/cost/summary" });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBeCloseTo(4, 2);
      expect(body.byAgent).toHaveLength(2);
    });
  });
});
