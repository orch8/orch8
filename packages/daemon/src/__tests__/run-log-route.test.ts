import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { mkdir, writeFile, appendFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { projects, agents, heartbeatRuns } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { decorateTestApp } from "./helpers/test-app.js";
import { runRoutes } from "../api/routes/runs.js";
import { authPlugin } from "../api/middleware/auth.js";

describe("GET /api/runs/:id/log — path safety and IO error handling", () => {
  let testDb: TestDb;
  let app: ReturnType<typeof Fastify>;
  let projectId: string;
  let projectHome: string;
  let logDir: string;

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

    projectHome = path.join(tmpdir(), `orch8-runlog-${randomUUID()}`);
    logDir = path.join(projectHome, ".orch8", "logs");
    await mkdir(logDir, { recursive: true });

    const [project] = await testDb.db
      .insert(projects)
      .values({
        name: "Run Log Test",
        slug: `runlog-${Date.now()}`,
        homeDir: projectHome,
      })
      .returning();
    projectId = project.id;

    app = Fastify();
    decorateTestApp(app, testDb.db);
    app.register(authPlugin, { allowLocalhostAdmin: true });
    app.register(runRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(projectHome, { recursive: true, force: true });
  });

  async function insertRun(logRef: string | null, status: "running" | "succeeded" = "succeeded"): Promise<string> {
    await testDb.db.insert(agents).values({
      id: "eng-1",
      projectId,
      name: "Eng",
      role: "engineer",
    });
    const [run] = await testDb.db
      .insert(heartbeatRuns)
      .values({
        agentId: "eng-1",
        projectId,
        invocationSource: "on_demand",
        status,
        logStore: "local",
        logRef,
      })
      .returning();
    return run.id;
  }

  it("returns the log contents for an in-bounds path (200)", async () => {
    const logPath = path.join(logDir, "run_xyz.log");
    await writeFile(logPath, "line1\nline2\n", "utf-8");
    const runId = await insertRun(logPath);

    const res = await app.inject({
      method: "GET",
      url: `/api/runs/${runId}/log`,
      headers: { "x-project-id": projectId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.content).toBe("line1\nline2\n");
    expect(body.store).toBe("local");
  });

  it("returns new output from a running agent without waiting for completion", async () => {
    const logPath = path.join(logDir, "live.log");
    await writeFile(logPath, "agent started\n");
    const runId = await insertRun(logPath, "running");
    const read = () => app.inject({ method: "GET", url: `/api/runs/${runId}/log`, headers: { "x-project-id": projectId } });
    expect((await read()).json().content).toBe("agent started\n");
    await appendFile(logPath, "tests failed\n");
    const updated = await read();
    expect(updated.statusCode).toBe(200);
    expect(updated.json().content).toBe("agent started\ntests failed\n");
  });

  it("serves a bounded suffix for live polling without changing full log reads", async () => {
    const logPath = path.join(logDir, "long.log");
    const content = "a".repeat(300_000) + "tests passed\n";
    await writeFile(logPath, content);
    const runId = await insertRun(logPath, "running");
    const headers = { "x-project-id": projectId };
    const tail = await app.inject({ method: "GET", url: `/api/runs/${runId}/log?tailBytes=100`, headers });
    expect(tail.statusCode).toBe(200);
    expect(tail.json()).toEqual({ content: content.slice(-100), store: "local", bytes: Buffer.byteLength(content) });
    const capped = await app.inject({ method: "GET", url: `/api/runs/${runId}/log?tailBytes=999999999`, headers });
    expect(Buffer.byteLength(capped.json().content)).toBe(262144);
    const full = await app.inject({ method: "GET", url: `/api/runs/${runId}/log`, headers });
    expect(full.json().content).toBe(content);
    const invalid = await app.inject({ method: "GET", url: `/api/runs/${runId}/log?tailBytes=-1`, headers });
    expect(invalid.statusCode).toBe(400);
  });

  it("refuses to serve a log path outside the project logDir (403)", async () => {
    const attacker = path.join(tmpdir(), `orch8-escape-${randomUUID()}.txt`);
    await writeFile(attacker, "secrets\n", "utf-8");

    const runId = await insertRun(attacker);

    try {
      const res = await app.inject({
        method: "GET",
        url: `/api/runs/${runId}/log`,
        headers: { "x-project-id": projectId },
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await rm(attacker, { force: true });
    }
  });

  it("refuses ../ traversal that resolves outside the project logDir (403)", async () => {
    // logRef lexically starts inside logDir but ../ escapes on resolve.
    const sneaky = path.join(logDir, "..", "..", "..", "etc", "passwd");
    const runId = await insertRun(sneaky);

    const res = await app.inject({
      method: "GET",
      url: `/api/runs/${runId}/log`,
      headers: { "x-project-id": projectId },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 404 when the log file is missing (ENOENT)", async () => {
    const logPath = path.join(logDir, "missing.log");
    const runId = await insertRun(logPath);

    const res = await app.inject({
      method: "GET",
      url: `/api/runs/${runId}/log`,
      headers: { "x-project-id": projectId },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 500 for non-ENOENT IO failures", async () => {
    // Create a subdirectory (not a file) inside the project's logDir.
    // readFile against a directory returns EISDIR, which the route must
    // map to 500 with a logged error, not 404.
    const nested = path.join(logDir, "not-a-file");
    await mkdir(nested, { recursive: true });
    const runId = await insertRun(nested);

    const res = await app.inject({
      method: "GET",
      url: `/api/runs/${runId}/log`,
      headers: { "x-project-id": projectId },
    });

    expect(res.statusCode).toBe(500);
  });

  it("returns 404 when the run has no logRef stored", async () => {
    const runId = await insertRun(null);

    const res = await app.inject({
      method: "GET",
      url: `/api/runs/${runId}/log`,
      headers: { "x-project-id": projectId },
    });

    expect(res.statusCode).toBe(404);
  });
});
