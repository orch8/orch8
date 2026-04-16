import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { EventEmitter } from "node:events";
import { Writable, Readable } from "node:stream";
import { projects, tasks, agents, taskDependencies, heartbeatRuns } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { buildServer } from "../server.js";
import { globalConfigSchema } from "../config/schema.js";

function createMockProcess() {
  const stdin = new Writable({
    write(_chunk, _encoding, callback) { callback(); },
  });
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const proc = Object.assign(new EventEmitter(), {
    stdin, stdout, stderr, pid: 55555,
    kill: vi.fn(() => { proc.emit("close", 0, null); return true; }),
  });
  // Simulate turn completing so session.process is cleared
  process.nextTick(() => proc.emit("close", 0, null));
  return proc;
}

describe("Integration: Task Type Lifecycle", () => {
  let testDb: TestDb;
  let app: ReturnType<typeof buildServer>;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    app = buildServer({
      databaseUrl: testDb.connectionUri,
      spawnFn: vi.fn(() => createMockProcess()) as unknown as typeof import("node:child_process").spawn,
      // Enable the loopback-admin bypass so app.inject() requests — which
      // use 127.0.0.1 as remoteAddress — pass auth without needing to
      // thread a bearer token through every test case.
      config: globalConfigSchema.parse({ auth: { allow_localhost_admin: true } }),
    });
    await app.ready();

    const [project] = await testDb.db.insert(projects).values({
      name: "Integration",
      slug: "integration",
      homeDir: "/tmp/integ",
      worktreeDir: "/tmp/integ-wt",
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values({
      id: "int-agent",
      projectId,
      name: "Integration Agent",
      role: "engineer",
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(heartbeatRuns);
    await testDb.db.delete(taskDependencies);
    await testDb.db.delete(tasks);
  });

  it("full quick task lifecycle: create → list → complete", async () => {
    // Create
    const createRes = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-project-id": projectId },
      payload: { title: "Quick fix", projectId, taskType: "quick" },
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);

    // List
    const listRes = await app.inject({
      method: "GET",
      url: `/api/tasks?projectId=${projectId}`,
      headers: { "x-project-id": projectId },
    });
    expect(JSON.parse(listRes.body)).toHaveLength(1);

    // Move to in_progress directly in DB (worktree creation requires a real git repo;
    // lifecycle transitions are fully tested in task-lifecycle.service.test.ts)
    await testDb.db
      .update(tasks)
      .set({ column: "in_progress", executionAgentId: "int-agent", executionRunId: "run-1" })
      .where(eq(tasks.id, created.id));

    // Complete
    const completeRes = await app.inject({
      method: "POST",
      url: `/api/tasks/${created.id}/complete`,
      headers: { "x-project-id": projectId },
    });
    expect(completeRes.statusCode).toBe(200);
    const completed = JSON.parse(completeRes.body);
    expect(completed.column).toBe("done");
  });

  it("dependency management: add dependency, reject cycle", async () => {
    const [a, b, c] = await Promise.all([
      app.inject({
        method: "POST", url: "/api/tasks",
        headers: { "x-project-id": projectId },
        payload: { title: "A", projectId, taskType: "quick" },
      }),
      app.inject({
        method: "POST", url: "/api/tasks",
        headers: { "x-project-id": projectId },
        payload: { title: "B", projectId, taskType: "quick" },
      }),
      app.inject({
        method: "POST", url: "/api/tasks",
        headers: { "x-project-id": projectId },
        payload: { title: "C", projectId, taskType: "quick" },
      }),
    ]);

    const taskA = JSON.parse(a.body);
    const taskB = JSON.parse(b.body);
    const taskC = JSON.parse(c.body);

    // A depends on B
    const dep1 = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskA.id}/dependencies`,
      headers: { "x-project-id": projectId },
      payload: { dependsOnId: taskB.id },
    });
    expect(dep1.statusCode).toBe(201);

    // B depends on C
    const dep2 = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskB.id}/dependencies`,
      headers: { "x-project-id": projectId },
      payload: { dependsOnId: taskC.id },
    });
    expect(dep2.statusCode).toBe(201);

    // C depends on A → cycle
    const dep3 = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskC.id}/dependencies`,
      headers: { "x-project-id": projectId },
      payload: { dependsOnId: taskA.id },
    });
    expect(dep3.statusCode).toBe(409);
  });
});
