import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { projects, agents, heartbeatRuns } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { SubagentService } from "../services/subagent.service.js";

describe("SubagentService concurrency", () => {
  let testDb: TestDb;
  let service: SubagentService;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Subagent Test",
      slug: "subagent-test",
      homeDir: "/tmp/subagent-test",
      worktreeDir: "/tmp/subagent-wt",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(heartbeatRuns);
    await testDb.db.delete(agents);

    // Coordinator with maxConcurrentSubagents = 2
    await testDb.db.insert(agents).values({
      id: "coordinator",
      projectId,
      name: "Coordinator",
      role: "engineer",
      maxConcurrentSubagents: 2,
    });

    await testDb.db.insert(agents).values({
      id: "worker-1",
      projectId,
      name: "Worker 1",
      role: "implementer",
    });

    service = new SubagentService(testDb.db);
  });

  it("allows registration up to maxConcurrentSubagents", async () => {
    // Create parent run
    const [parentRun] = await testDb.db.insert(heartbeatRuns).values({
      agentId: "coordinator",
      projectId,
      invocationSource: "on_demand",
      status: "running",
    }).returning();

    const child1 = await service.registerChild(parentRun.id, {
      agentId: "worker-1",
      projectId,
      scope: "task-a",
      maxConcurrentSubagents: 2,
    });
    expect(child1).toBeTruthy();

    const child2 = await service.registerChild(parentRun.id, {
      agentId: "worker-1",
      projectId,
      scope: "task-b",
      maxConcurrentSubagents: 2,
    });
    expect(child2).toBeTruthy();
  });

  it("rejects registration when at maxConcurrentSubagents", async () => {
    const [parentRun] = await testDb.db.insert(heartbeatRuns).values({
      agentId: "coordinator",
      projectId,
      invocationSource: "on_demand",
      status: "running",
    }).returning();

    // Fill up slots
    await service.registerChild(parentRun.id, {
      agentId: "worker-1",
      projectId,
      scope: "task-a",
      maxConcurrentSubagents: 2,
    });
    await service.registerChild(parentRun.id, {
      agentId: "worker-1",
      projectId,
      scope: "task-b",
      maxConcurrentSubagents: 2,
    });

    // Third should throw
    await expect(
      service.registerChild(parentRun.id, {
        agentId: "worker-1",
        projectId,
        scope: "task-c",
        maxConcurrentSubagents: 2,
      }),
    ).rejects.toThrow("maxConcurrentSubagents");
  });

  it("allows new registrations after children complete", async () => {
    const [parentRun] = await testDb.db.insert(heartbeatRuns).values({
      agentId: "coordinator",
      projectId,
      invocationSource: "on_demand",
      status: "running",
    }).returning();

    const child1 = await service.registerChild(parentRun.id, {
      agentId: "worker-1",
      projectId,
      scope: "task-a",
      maxConcurrentSubagents: 2,
    });

    await service.registerChild(parentRun.id, {
      agentId: "worker-1",
      projectId,
      scope: "task-b",
      maxConcurrentSubagents: 2,
    });

    // Complete child1
    await service.completeChild(child1.id, {
      status: "succeeded",
    });

    // Now another slot is available
    const child3 = await service.registerChild(parentRun.id, {
      agentId: "worker-1",
      projectId,
      scope: "task-c",
      maxConcurrentSubagents: 2,
    });
    expect(child3).toBeTruthy();
  });
});
