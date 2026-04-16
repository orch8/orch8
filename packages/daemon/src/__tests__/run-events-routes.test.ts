import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import Fastify from "fastify";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { projects, agents, heartbeatRuns, runEvents } from "@orch/shared/db";
import { eq } from "drizzle-orm";
import { runRoutes } from "../api/routes/runs.js";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

describe("Run Events Routes", () => {
  let testDb: TestDb;
  const projectId = `proj_${randomUUID()}`;
  const agentId = "test-agent";
  const runId = `run_${randomUUID()}`;
  const projectHomeDir = join(tmpdir(), `orch8-run-events-home-${randomUUID()}`);
  const projectLogDir = join(projectHomeDir, ".orch8", "logs");

  beforeAll(async () => {
    testDb = await setupTestDb();
    await mkdir(projectLogDir, { recursive: true });
    await testDb.db.insert(projects).values({
      id: projectId,
      name: "Test",
      slug: "test",
      homeDir: projectHomeDir,
      worktreeDir: join(projectHomeDir, "worktrees"),
    });
    await testDb.db.insert(agents).values({
      id: agentId,
      projectId,
      name: "Test Agent",
      role: "engineer",
      model: "claude-sonnet-4-6",
    });
    await testDb.db.insert(heartbeatRuns).values({
      id: runId,
      agentId,
      projectId,
      invocationSource: "on_demand",
      status: "succeeded",
    });
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(runEvents);
  });

  function createApp() {
    const app = Fastify();
    app.decorate("db", testDb.db);
    app.addHook("onRequest", async (request) => {
      (request as any).projectId = projectId;
    });
    app.register(runRoutes);
    return app;
  }

  describe("GET /api/runs/:id/events", () => {
    it("returns events ordered by seq", async () => {
      await testDb.db.insert(runEvents).values([
        { runId, projectId, seq: 1, timestamp: new Date(), eventType: "tool_use", toolName: "Read", summary: "Read /a.ts", payload: {} },
        { runId, projectId, seq: 0, timestamp: new Date(), eventType: "init", summary: "Session initialized", payload: {} },
        { runId, projectId, seq: 2, timestamp: new Date(), eventType: "result", summary: "Run completed", payload: {} },
      ]);

      const app = createApp();
      const res = await app.inject({
        method: "GET",
        url: `/api/runs/${runId}/events`,
        query: { projectId },
      });

      expect(res.statusCode).toBe(200);
      const events = res.json();
      expect(events).toHaveLength(3);
      expect(events[0].seq).toBe(0);
      expect(events[1].seq).toBe(1);
      expect(events[2].seq).toBe(2);
    });

    it("returns empty array when no events", async () => {
      const app = createApp();
      const res = await app.inject({
        method: "GET",
        url: `/api/runs/${runId}/events`,
        query: { projectId },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it("returns 400 without projectId", async () => {
      const app = Fastify();
      app.decorate("db", testDb.db);
      app.addHook("onRequest", async (request) => {
        (request as any).projectId = undefined;
      });
      app.register(runRoutes);

      const res = await app.inject({
        method: "GET",
        url: `/api/runs/${runId}/events`,
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /api/runs/:id/log (updated)", () => {
    it("returns log file content", async () => {
      const logPath = join(projectLogDir, `test-${randomUUID()}.log`);
      await writeFile(logPath, "line1\nline2\nline3\n");

      await testDb.db
        .update(heartbeatRuns)
        .set({ logRef: logPath, logStore: "local" })
        .where(eq(heartbeatRuns.id, runId));

      const app = createApp();
      const res = await app.inject({
        method: "GET",
        url: `/api/runs/${runId}/log`,
        query: { projectId },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.content).toBe("line1\nline2\nline3\n");
      expect(body.store).toBe("local");
      expect(body.bytes).toBe(18);
    });

    it("supports tail param", async () => {
      const logPath = join(projectLogDir, `test-tail-${randomUUID()}.log`);
      await writeFile(logPath, "line1\nline2\nline3\n");

      await testDb.db
        .update(heartbeatRuns)
        .set({ logRef: logPath, logStore: "local" })
        .where(eq(heartbeatRuns.id, runId));

      const app = createApp();
      const res = await app.inject({
        method: "GET",
        url: `/api/runs/${runId}/log`,
        query: { projectId, tail: "2" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.content).toBe("line2\nline3");
    });
  });
});
