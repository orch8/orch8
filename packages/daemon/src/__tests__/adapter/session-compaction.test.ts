// packages/daemon/src/__tests__/adapter/session-compaction.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, type TestDb } from "../helpers/test-db.js";
import { SessionManager } from "../../adapter/session-manager.js";
import { taskSessions, heartbeatRuns, projects, tasks } from "@orch/shared/db";

describe("SessionManager.getSessionStats", () => {
  let testDb: TestDb;
  let sessionManager: SessionManager;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    sessionManager = new SessionManager(testDb.db);
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(heartbeatRuns);
    await testDb.db.delete(taskSessions);
    await testDb.db.delete(tasks);
    await testDb.db.delete(projects);

    const [proj] = await testDb.db.insert(projects).values({
      name: "Test",
      slug: "test",
      homeDir: "/tmp/test",
      worktreeDir: "/tmp/test/worktrees",
    }).returning();
    projectId = proj.id;
  });

  it("returns null when no session exists", async () => {
    const stats = await sessionManager.getSessionStats("agent-1", "task-1", "claude_local");
    expect(stats).toBeNull();
  });

  it("returns run count and token totals for a session", async () => {
    // Create a task so the FK is satisfied
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Test task",
    }).returning();

    // Create a session using the task ID as taskKey
    await testDb.db.insert(taskSessions).values({
      agentId: "agent-1",
      projectId,
      taskKey: task.id,
      adapterType: "claude_local",
      sessionParamsJson: { sessionId: "sess-1", cwd: "/tmp" },
      sessionDisplayId: "sess-1",
      createdAt: new Date(Date.now() - 3600_000), // 1 hour ago
    });

    // Create runs associated with this agent+task
    await testDb.db.insert(heartbeatRuns).values([
      {
        agentId: "agent-1",
        projectId,
        taskId: task.id,
        status: "succeeded",
        invocationSource: "timer",
        usageJson: { input_tokens: 1000, output_tokens: 200 },
        createdAt: new Date(Date.now() - 3000_000),
      },
      {
        agentId: "agent-1",
        projectId,
        taskId: task.id,
        status: "succeeded",
        invocationSource: "timer",
        usageJson: { input_tokens: 2000, output_tokens: 400 },
        createdAt: new Date(Date.now() - 2000_000),
      },
    ]);

    const stats = await sessionManager.getSessionStats("agent-1", task.id, "claude_local");
    expect(stats).not.toBeNull();
    expect(stats!.runCount).toBe(2);
    expect(stats!.totalInputTokens).toBe(3000);
    expect(stats!.sessionAgeHours).toBeGreaterThan(0);
    expect(stats!.sessionAgeHours).toBeLessThan(2); // roughly 1 hour
  });
});
