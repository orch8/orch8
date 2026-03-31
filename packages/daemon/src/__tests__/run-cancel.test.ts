import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import { projects, agents, heartbeatRuns } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { runRoutes } from "../api/routes/runs.js";
import { authPlugin } from "../api/middleware/auth.js";
import { HeartbeatService } from "../services/heartbeat.service.js";
import { BroadcastService } from "../services/broadcast.service.js";

describe("Run Cancel + Log Routes", () => {
  let testDb: TestDb;
  let app: ReturnType<typeof Fastify>;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Run Cancel Test",
      slug: "run-cancel-test",
      homeDir: "/tmp/run-cancel",
      worktreeDir: "/tmp/run-cancel-wt",
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

    const sockets = new Set() as unknown as Set<import("ws").WebSocket>;
    const broadcastService = new BroadcastService(sockets);
    const heartbeatService = new HeartbeatService(testDb.db, broadcastService);
    app.decorate("heartbeatService", heartbeatService);

    app.register(authPlugin);
    app.register(runRoutes);
    await app.ready();
  });

  describe("POST /api/runs/:id/cancel", () => {
    it("cancels a queued run", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
      });
      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1", projectId, invocationSource: "on_demand", status: "queued",
      }).returning();

      const res = await app.inject({
        method: "POST",
        url: `/api/runs/${run.id}/cancel`,
        headers: { "x-project-id": projectId },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("cancelled");
    });

    it("returns 404 for nonexistent run", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/runs/run_nonexistent/cancel",
        headers: { "x-project-id": projectId },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 409 for already-finished run", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
      });
      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1", projectId, invocationSource: "on_demand",
        status: "succeeded", finishedAt: new Date(),
      }).returning();

      const res = await app.inject({
        method: "POST",
        url: `/api/runs/${run.id}/cancel`,
        headers: { "x-project-id": projectId },
      });

      expect(res.statusCode).toBe(409);
    });
  });

  describe("GET /api/runs/:id/log", () => {
    it("returns log content for a run", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
      });
      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1", projectId, invocationSource: "on_demand",
        status: "succeeded", logStore: "inline", logRef: "Line 1\nLine 2\nDone",
      }).returning();

      const res = await app.inject({
        method: "GET",
        url: `/api/runs/${run.id}/log`,
        headers: { "x-project-id": projectId },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().log).toBe("Line 1\nLine 2\nDone");
    });

    it("returns 404 for run with no log", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
      });
      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1", projectId, invocationSource: "on_demand", status: "queued",
      }).returning();

      const res = await app.inject({
        method: "GET",
        url: `/api/runs/${run.id}/log`,
        headers: { "x-project-id": projectId },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
