import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { projects, agents, heartbeatRuns, wakeupRequests, tasks } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { SchedulerService } from "../services/scheduler.service.js";
import { HeartbeatService } from "../services/heartbeat.service.js";

describe("SchedulerService", () => {
  let testDb: TestDb;
  let heartbeatService: HeartbeatService;
  let scheduler: SchedulerService;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Scheduler Test",
      slug: "scheduler-test",
      homeDir: "/tmp/scheduler-test",
      worktreeDir: "/tmp/scheduler-wt",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    scheduler?.stop();
    heartbeatService?.shutdown();
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(heartbeatRuns);
    await testDb.db.delete(agents);

    const broadcast = () => {};
    heartbeatService = new HeartbeatService(testDb.db, broadcast);
    scheduler = new SchedulerService(testDb.db, heartbeatService, {
      intervalMs: 60_000,
      stalenessThresholdMs: 5 * 60 * 1000,
    });
  });

  describe("reapOrphanedRuns", () => {
    it("fails a stale running run with no tracked process", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
      });

      // Create a run that has been "running" for 10 minutes with no process
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1",
        projectId,
        invocationSource: "on_demand",
        status: "running",
        startedAt: tenMinAgo,
      }).returning();

      const reaped = await scheduler.reapOrphanedRuns();
      expect(reaped).toHaveLength(1);
      expect(reaped[0].id).toBe(run.id);

      const [updated] = await testDb.db
        .select()
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.id, run.id));
      expect(updated.status).toBe("failed");
      expect(updated.errorCode).toBe("process_lost");
    });

    it("skips runs that are still within staleness threshold", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
      });

      // Run started 1 minute ago (within 5 min threshold)
      const oneMinAgo = new Date(Date.now() - 1 * 60 * 1000);
      await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1",
        projectId,
        invocationSource: "on_demand",
        status: "running",
        startedAt: oneMinAgo,
      });

      const reaped = await scheduler.reapOrphanedRuns();
      expect(reaped).toHaveLength(0);
    });

    it("skips runs tracked in heartbeat service active set", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
      });

      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1",
        projectId,
        invocationSource: "on_demand",
        status: "running",
        startedAt: tenMinAgo,
      }).returning();

      // Simulate the run being tracked in-memory
      heartbeatService["activeRunExecutions"].add(run.id);

      const reaped = await scheduler.reapOrphanedRuns();
      expect(reaped).toHaveLength(0);

      heartbeatService["activeRunExecutions"].delete(run.id);
    });

    it("retries once before failing permanently", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
      });

      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1",
        projectId,
        invocationSource: "on_demand",
        status: "running",
        startedAt: tenMinAgo,
        processLossRetryCount: 0,
      }).returning();

      const reaped = await scheduler.reapOrphanedRuns();

      // Should have incremented retry count and failed the orphan
      const [updated] = await testDb.db
        .select()
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.id, run.id));
      expect(updated.status).toBe("failed");
      expect(updated.processLossRetryCount).toBe(1);

      // A retry run should have been created
      const allRuns = await testDb.db
        .select()
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.agentId, "eng-1"));
      const retryRun = allRuns.find(
        (r) => r.retryOfRunId === run.id,
      );
      expect(retryRun).toBeTruthy();
      // startNextQueuedRunForAgent promotes the retry run to "running"
      expect(["queued", "running"]).toContain(retryRun!.status);
    });

    it("does not retry when processLossRetryCount >= 1", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
      });

      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1",
        projectId,
        invocationSource: "on_demand",
        status: "running",
        startedAt: tenMinAgo,
        processLossRetryCount: 1,
      });

      const reaped = await scheduler.reapOrphanedRuns();
      expect(reaped).toHaveLength(1);

      // No retry run should have been created
      const allRuns = await testDb.db
        .select()
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.agentId, "eng-1"));
      expect(allRuns).toHaveLength(1); // Only the original
    });
  });

  describe("enhanced tick loop", () => {
    it("tick runs tickTimers, reapOrphanedRuns, unblockResolved, and processVerificationQueue", async () => {
      // Setup: agent with heartbeat due
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      await testDb.db.insert(agents).values({
        id: "eng-loop",
        projectId,
        name: "Loop Eng",
        role: "engineer",
        heartbeatEnabled: true,
        heartbeatIntervalSec: 60,
        lastHeartbeat: fiveMinAgo,
      });

      // Provide a TaskService for unblockResolved
      const { TaskService } = await import("../services/task.service.js");
      const taskService = new TaskService(testDb.db);
      scheduler.setTaskService(taskService);

      // Run one full tick
      await scheduler.tick();

      // Verify timer wakeup was created
      const wakeups = await testDb.db
        .select()
        .from(wakeupRequests)
        .where(eq(wakeupRequests.agentId, "eng-loop"));
      expect(wakeups.length).toBeGreaterThanOrEqual(1);
    });
  });
});
