import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import { projects, agents, heartbeatRuns } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { runRoutes } from "../api/routes/runs.js";
import { authPlugin } from "../api/middleware/auth.js";
import { HeartbeatService } from "../services/heartbeat.service.js";
import { BroadcastService } from "../services/broadcast.service.js";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

describe("Run Cancel + Log Routes", () => {
  let testDb: TestDb;
  let app: ReturnType<typeof Fastify>;
  let projectId: string;
  let projectHomeDir: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    projectHomeDir = join(tmpdir(), `orch8-run-cancel-home-${randomUUID()}`);
    await mkdir(join(projectHomeDir, ".orch8", "logs"), { recursive: true });

    const [project] = await testDb.db.insert(projects).values({
      name: "Run Cancel Test",
      slug: "run-cancel-test",
      homeDir: projectHomeDir,
      worktreeDir: join(projectHomeDir, "worktrees"),
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

    app.register(authPlugin, { allowLocalhostAdmin: true });
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

  describe("POST /api/runs/:id/retry", () => {
    it("enqueues a wakeup for a failed run", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
      });
      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1", projectId, invocationSource: "on_demand",
        status: "failed", finishedAt: new Date(),
      }).returning();

      const res = await app.inject({
        method: "POST",
        url: `/api/runs/${run.id}/retry`,
        headers: { "x-project-id": projectId },
      });

      expect(res.statusCode).toBe(202);
      expect(["queued", "coalesced", "skipped"]).toContain(res.json().status);
    });

    it("returns 409 for a succeeded run", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
      });
      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1", projectId, invocationSource: "on_demand",
        status: "succeeded", finishedAt: new Date(),
      }).returning();

      const res = await app.inject({
        method: "POST",
        url: `/api/runs/${run.id}/retry`,
        headers: { "x-project-id": projectId },
      });

      expect(res.statusCode).toBe(409);
    });

    it("returns 404 for nonexistent run", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/runs/run_nonexistent/retry",
        headers: { "x-project-id": projectId },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /api/runs/:id/log", () => {
    it("returns log content for a run", async () => {
      // Write the log inside the project's expected logDir so the
      // realpath check (routes/runs.ts GET /log) passes.
      const logDir = join(projectHomeDir, ".orch8", "logs");
      await mkdir(logDir, { recursive: true });
      const logPath = join(logDir, `test-${randomUUID()}.log`);
      await writeFile(logPath, "Line 1\nLine 2\nDone");

      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
      });
      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1", projectId, invocationSource: "on_demand",
        status: "succeeded", logStore: "local", logRef: logPath,
      }).returning();

      const res = await app.inject({
        method: "GET",
        url: `/api/runs/${run.id}/log`,
        headers: { "x-project-id": projectId },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().content).toBe("Line 1\nLine 2\nDone");
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
