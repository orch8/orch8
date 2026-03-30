// packages/daemon/src/__tests__/cost-phase.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import { projects, agents, tasks, heartbeatRuns } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { authPlugin } from "../api/middleware/auth.js";
import { costRoutes } from "../api/routes/cost.js";
import "../types.js";

describe("Cost Per-Phase Route", () => {
  let testDb: TestDb;
  let app: ReturnType<typeof Fastify>;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Cost Phase Test",
      slug: "cost-phase",
      homeDir: "/tmp/cost-phase",
      worktreeDir: "/tmp/cost-phase-wt",
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

    await testDb.db.insert(agents).values({
      id: "eng-1", projectId, name: "Engineer", role: "engineer",
    });

    app = Fastify();
    app.decorate("db", testDb.db);
    app.register(authPlugin);
    app.register(costRoutes);
    await app.ready();
  });

  it("GET /api/cost/task/:taskId/phases returns cost grouped by phase", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Complex task",
      taskType: "complex",
      complexPhase: "implement",
    }).returning();

    // Create runs for different phases
    await testDb.db.insert(heartbeatRuns).values([
      {
        agentId: "eng-1",
        projectId,
        taskId: task.id,
        invocationSource: "assignment",
        status: "succeeded",
        costUsd: 0.50,
        triggerDetail: "phase:research",
        finishedAt: new Date(),
      },
      {
        agentId: "eng-1",
        projectId,
        taskId: task.id,
        invocationSource: "assignment",
        status: "succeeded",
        costUsd: 1.25,
        triggerDetail: "phase:plan",
        finishedAt: new Date(),
      },
      {
        agentId: "eng-1",
        projectId,
        taskId: task.id,
        invocationSource: "assignment",
        status: "succeeded",
        costUsd: 3.00,
        triggerDetail: "phase:implement",
        finishedAt: new Date(),
      },
    ]);

    const res = await app.inject({
      method: "GET",
      url: `/api/cost/task/${task.id}/phases`,
      headers: {
        "x-project-id": projectId,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBeCloseTo(4.75, 1);
    expect(body.byPhase).toHaveLength(3);
  });

  it("returns empty byPhase array when task has no runs", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Empty task",
      taskType: "complex",
      complexPhase: "research",
    }).returning();

    const res = await app.inject({
      method: "GET",
      url: `/api/cost/task/${task.id}/phases`,
      headers: {
        "x-project-id": projectId,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(0);
    expect(body.byPhase).toHaveLength(0);
  });

  it("groups runs without phase prefix as 'unknown'", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Mixed task",
      taskType: "complex",
      complexPhase: "implement",
    }).returning();

    await testDb.db.insert(heartbeatRuns).values([
      {
        agentId: "eng-1",
        projectId,
        taskId: task.id,
        invocationSource: "assignment",
        status: "succeeded",
        costUsd: 1.00,
        triggerDetail: "phase:implement",
        finishedAt: new Date(),
      },
      {
        agentId: "eng-1",
        projectId,
        taskId: task.id,
        invocationSource: "on_demand",
        status: "succeeded",
        costUsd: 0.50,
        triggerDetail: "manual-run",
        finishedAt: new Date(),
      },
    ]);

    const res = await app.inject({
      method: "GET",
      url: `/api/cost/task/${task.id}/phases`,
      headers: {
        "x-project-id": projectId,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBeCloseTo(1.50, 2);
    expect(body.byPhase).toHaveLength(2);

    const implementPhase = body.byPhase.find((p: { phase: string }) => p.phase === "implement");
    expect(implementPhase).toBeDefined();
    expect(implementPhase.totalCost).toBeCloseTo(1.00, 2);

    const unknownPhase = body.byPhase.find((p: { phase: string }) => p.phase === "unknown");
    expect(unknownPhase).toBeDefined();
    expect(unknownPhase.totalCost).toBeCloseTo(0.50, 2);
  });

  it("returns 400 when projectId is missing", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/cost/task/some-task-id/phases`,
      // No x-project-id header
    });

    expect(res.statusCode).toBe(400);
  });
});
