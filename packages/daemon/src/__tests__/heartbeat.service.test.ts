import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
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
});
