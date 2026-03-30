import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { projects, agents, heartbeatRuns, wakeupRequests, tasks } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { HeartbeatService } from "../services/heartbeat.service.js";

describe("HeartbeatService", () => {
  let testDb: TestDb;
  let service: HeartbeatService;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Heartbeat Test",
      slug: "heartbeat-test",
      homeDir: "/tmp/heartbeat-test",
      worktreeDir: "/tmp/heartbeat-wt",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    service.shutdown();
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(wakeupRequests);
    await testDb.db.delete(heartbeatRuns);
    await testDb.db.delete(tasks);
    await testDb.db.delete(agents);
    await testDb.db.update(projects).set({
      budgetPaused: false,
      budgetLimitUsd: null,
      budgetSpentUsd: 0,
    });

    const broadcast = () => {};
    service = new HeartbeatService(testDb.db, broadcast);
  });

  describe("enqueueWakeup — validation", () => {
    it("throws for nonexistent agent", async () => {
      await expect(
        service.enqueueWakeup("nonexistent", projectId, { source: "on_demand" }),
      ).rejects.toThrow("Agent not found");
    });

    it("creates skipped wakeup for paused agent", async () => {
      await testDb.db.insert(agents).values({
        id: "paused-1", projectId, name: "Paused", role: "engineer",
        status: "paused",
      });

      const result = await service.enqueueWakeup("paused-1", projectId, {
        source: "on_demand",
      });
      expect(result.status).toBe("skipped");
    });

    it("creates skipped wakeup for terminated agent", async () => {
      await testDb.db.insert(agents).values({
        id: "term-1", projectId, name: "Terminated", role: "engineer",
        status: "terminated",
      });

      const result = await service.enqueueWakeup("term-1", projectId, {
        source: "on_demand",
      });
      expect(result.status).toBe("skipped");
    });

    it("creates skipped wakeup when policy disallows source", async () => {
      await testDb.db.insert(agents).values({
        id: "no-timer", projectId, name: "No Timer", role: "engineer",
        heartbeatEnabled: false,
      });

      const result = await service.enqueueWakeup("no-timer", projectId, {
        source: "timer",
      });
      expect(result.status).toBe("skipped");
    });

    it("creates skipped wakeup when wakeOnAssignment is false", async () => {
      await testDb.db.insert(agents).values({
        id: "no-assign", projectId, name: "No Assign", role: "engineer",
        wakeOnAssignment: false,
      });

      const result = await service.enqueueWakeup("no-assign", projectId, {
        source: "assignment",
      });
      expect(result.status).toBe("skipped");
    });

    it("creates budget_blocked wakeup when budget exhausted", async () => {
      await testDb.db.update(projects).set({
        budgetLimitUsd: 100,
        budgetSpentUsd: 100,
      });
      await testDb.db.insert(agents).values({
        id: "budget-1", projectId, name: "Budget Agent", role: "engineer",
      });

      const result = await service.enqueueWakeup("budget-1", projectId, {
        source: "on_demand",
      });
      expect(result.status).toBe("budget_blocked");
    });

    it("creates queued wakeup and run for valid agent", async () => {
      await testDb.db.insert(agents).values({
        id: "valid-1", projectId, name: "Valid", role: "engineer",
        wakeOnOnDemand: true,
      });

      const result = await service.enqueueWakeup("valid-1", projectId, {
        source: "on_demand",
      });
      expect(result.status).toBe("queued");
      expect(result.runId).toBeTruthy();
    });
  });

  describe("enqueueWakeup — task execution locking", () => {
    it("claims lock when no active execution on task", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
      });
      const [task] = await testDb.db.insert(tasks).values({
        projectId, title: "Test Task",
      }).returning();

      const result = await service.enqueueWakeup("eng-1", projectId, {
        source: "on_demand",
        taskId: task.id,
      });
      expect(result.status).toBe("queued");

      // Task should now have the execution lock
      const [updated] = await testDb.db
        .select()
        .from(tasks)
        .where(eq(tasks.id, task.id));
      expect(updated.executionAgentId).toBe("eng-1");
      expect(updated.executionRunId).toBeTruthy();
      expect(updated.executionLockedAt).toBeTruthy();
    });

    it("coalesces when same agent re-wakes same task", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
      });
      const [task] = await testDb.db.insert(tasks).values({
        projectId, title: "Coalesce Task",
      }).returning();

      // First wakeup claims the lock
      const first = await service.enqueueWakeup("eng-1", projectId, {
        source: "on_demand",
        taskId: task.id,
      });
      expect(first.status).toBe("queued");

      // Second wakeup by same agent should coalesce
      const second = await service.enqueueWakeup("eng-1", projectId, {
        source: "on_demand",
        taskId: task.id,
      });
      expect(second.status).toBe("coalesced");
    });

    it("defers when different agent wakes same task", async () => {
      await testDb.db.insert(agents).values([
        { id: "eng-1", projectId, name: "Eng 1", role: "engineer" },
        { id: "eng-2", projectId, name: "Eng 2", role: "engineer" },
      ]);
      const [task] = await testDb.db.insert(tasks).values({
        projectId, title: "Defer Task",
      }).returning();

      // First agent claims
      const first = await service.enqueueWakeup("eng-1", projectId, {
        source: "on_demand",
        taskId: task.id,
      });
      expect(first.status).toBe("queued");

      // Second agent deferred
      const second = await service.enqueueWakeup("eng-2", projectId, {
        source: "on_demand",
        taskId: task.id,
      });
      expect(second.status).toBe("deferred_issue_execution");
    });

    it("general wakeup (no taskId) coalesces into existing queued run", async () => {
      await testDb.db.insert(agents).values({
        id: "cto-1", projectId, name: "CTO", role: "cto",
        heartbeatEnabled: true,
      });

      const first = await service.enqueueWakeup("cto-1", projectId, {
        source: "timer",
      });
      expect(first.status).toBe("queued");

      const second = await service.enqueueWakeup("cto-1", projectId, {
        source: "timer",
      });
      expect(second.status).toBe("coalesced");
    });
  });

  describe("claimQueuedRun", () => {
    it("atomically transitions queued run to running", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
      });
      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1",
        projectId,
        invocationSource: "on_demand",
        status: "queued",
      }).returning();

      const claimed = await service.claimQueuedRun(run.id);
      expect(claimed).not.toBeNull();
      expect(claimed!.status).toBe("running");
      expect(claimed!.startedAt).toBeTruthy();
    });

    it("returns existing run if already running (idempotent)", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
      });
      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1",
        projectId,
        invocationSource: "on_demand",
        status: "running",
        startedAt: new Date(),
      }).returning();

      const claimed = await service.claimQueuedRun(run.id);
      expect(claimed).not.toBeNull();
      expect(claimed!.id).toBe(run.id);
      expect(claimed!.status).toBe("running");
    });

    it("returns null if run was already claimed by another process", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
      });
      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1",
        projectId,
        invocationSource: "on_demand",
        status: "queued",
      }).returning();

      // Simulate another process claiming it first
      await testDb.db
        .update(heartbeatRuns)
        .set({ status: "succeeded", finishedAt: new Date() })
        .where(eq(heartbeatRuns.id, run.id));

      const claimed = await service.claimQueuedRun(run.id);
      expect(claimed).toBeNull();
    });

    it("blocks claim when budget exhausted at claim time", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
      });
      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1",
        projectId,
        invocationSource: "on_demand",
        status: "queued",
      }).returning();

      // Budget changes between enqueue and claim
      await testDb.db.update(projects).set({
        budgetLimitUsd: 100,
        budgetSpentUsd: 100,
      });

      const claimed = await service.claimQueuedRun(run.id);
      expect(claimed).toBeNull();

      // Run should be failed
      const [failed] = await testDb.db
        .select()
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.id, run.id));
      expect(failed.status).toBe("failed");
      expect(failed.errorCode).toBe("budget_blocked");
    });
  });
});
