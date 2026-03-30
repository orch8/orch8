import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Writable, Readable } from "node:stream";
import { projects, tasks, agents, taskDependencies, heartbeatRuns } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { buildServer } from "../server.js";

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

    // Move to in_progress
    await app.inject({
      method: "PATCH",
      url: `/api/tasks/${created.id}`,
      headers: { "x-project-id": projectId },
      payload: { column: "in_progress" },
    });

    // Complete
    const completeRes = await app.inject({
      method: "POST",
      url: `/api/tasks/${created.id}/complete`,
      headers: { "x-project-id": projectId },
    });
    expect(completeRes.statusCode).toBe(200);
    const completed = JSON.parse(completeRes.body);
    expect(completed.column).toBe("review");
  });

  it("full complex task lifecycle: create → phase through research/plan/implement/review", async () => {
    // Create
    const createRes = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-project-id": projectId },
      payload: { title: "Complex feature", projectId, taskType: "complex" },
    });
    const task = JSON.parse(createRes.body);
    expect(task.complexPhase).toBe("research");

    // Complete research
    const r1 = await app.inject({
      method: "POST",
      url: `/api/tasks/${task.id}/complete`,
      headers: { "x-project-id": projectId },
      payload: { output: "Research: found 3 approaches" },
    });
    expect(JSON.parse(r1.body).task.complexPhase).toBe("plan");

    // Complete plan
    const r2 = await app.inject({
      method: "POST",
      url: `/api/tasks/${task.id}/complete`,
      headers: { "x-project-id": projectId },
      payload: { output: "Plan: implement approach B" },
    });
    expect(JSON.parse(r2.body).task.complexPhase).toBe("implement");

    // Complete implement
    const r3 = await app.inject({
      method: "POST",
      url: `/api/tasks/${task.id}/complete`,
      headers: { "x-project-id": projectId },
      payload: { output: "Implementation complete" },
    });
    expect(JSON.parse(r3.body).task.complexPhase).toBe("review");

    // Complete review → moves to review column
    const r4 = await app.inject({
      method: "POST",
      url: `/api/tasks/${task.id}/complete`,
      headers: { "x-project-id": projectId },
      payload: { output: "Review: all looks good" },
    });
    const final = JSON.parse(r4.body);
    expect(final.task.column).toBe("review");
    expect(final.nextPhase).toBeNull();
  });

  it("brainstorm lifecycle: create → start → message → ready → convert", async () => {
    // Create
    const createRes = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-project-id": projectId },
      payload: { title: "Explore ideas", projectId, taskType: "brainstorm", assignee: "int-agent" },
    });
    const task = JSON.parse(createRes.body);
    expect(task.brainstormStatus).toBe("active");

    // Start session
    const startRes = await app.inject({
      method: "POST",
      url: `/api/brainstorm/${task.id}/start`,
      headers: { "x-project-id": projectId },
    });
    expect(startRes.statusCode).toBe(200);

    // Send message
    const msgRes = await app.inject({
      method: "POST",
      url: `/api/brainstorm/${task.id}/message`,
      headers: { "x-project-id": projectId },
      payload: { content: "What about microservices?" },
    });
    expect(msgRes.statusCode).toBe(200);

    // Mark ready
    const readyRes = await app.inject({
      method: "POST",
      url: `/api/brainstorm/${task.id}/ready`,
      headers: { "x-project-id": projectId },
    });
    expect(readyRes.statusCode).toBe(200);

    // Get transcript
    const transcriptRes = await app.inject({
      method: "GET",
      url: `/api/brainstorm/${task.id}/transcript`,
      headers: { "x-project-id": projectId },
    });
    expect(transcriptRes.statusCode).toBe(200);
    expect(JSON.parse(transcriptRes.body).transcript).toBeTruthy();

    // Convert to complex
    const convertRes = await app.inject({
      method: "POST",
      url: `/api/tasks/${task.id}/convert`,
      headers: { "x-project-id": projectId },
      payload: { taskType: "complex" },
    });
    expect(convertRes.statusCode).toBe(200);
    const converted = JSON.parse(convertRes.body);
    expect(converted.taskType).toBe("complex");
    expect(converted.complexPhase).toBe("research");
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
