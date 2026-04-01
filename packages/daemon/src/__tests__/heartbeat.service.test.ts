import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { projects, agents, heartbeatRuns, wakeupRequests, tasks } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { HeartbeatService } from "../services/heartbeat.service.js";
import { BroadcastService } from "../services/broadcast.service.js";

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

    const sockets = new Set() as unknown as Set<import("ws").WebSocket>;
    const broadcastService = new BroadcastService(sockets);
    service = new HeartbeatService(testDb.db, broadcastService);
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

  describe("enqueueWakeup — task-scoped wakeup", () => {
    it("creates a queued run for the task without setting execution lock", async () => {
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
      expect(result.runId).toBeTruthy();

      // Run should exist with correct taskId
      const [run] = await testDb.db
        .select()
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.id, result.runId!));
      expect(run.taskId).toBe(task.id);
      expect(run.agentId).toBe("eng-1");
      expect(run.status).not.toBe("queued"); // was promoted to running by startNext

      // Task should NOT have execution lock set by heartbeat
      const [updated] = await testDb.db
        .select()
        .from(tasks)
        .where(eq(tasks.id, task.id));
      expect(updated.executionAgentId).toBeNull();
      expect(updated.executionRunId).toBeNull();
      expect(updated.executionLockedAt).toBeNull();
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

    it("allows different agent to create separate queued run for same task", async () => {
      await testDb.db.insert(agents).values([
        { id: "eng-1", projectId, name: "Eng 1", role: "engineer" },
        { id: "eng-2", projectId, name: "Eng 2", role: "engineer" },
      ]);
      const [task] = await testDb.db.insert(tasks).values({
        projectId, title: "Multi Agent Task",
      }).returning();

      // First agent gets a queued run
      const first = await service.enqueueWakeup("eng-1", projectId, {
        source: "on_demand",
        taskId: task.id,
      });
      expect(first.status).toBe("queued");

      // Second agent also gets a queued run (no deferral since no lock-based gating)
      const second = await service.enqueueWakeup("eng-2", projectId, {
        source: "on_demand",
        taskId: task.id,
      });
      expect(second.status).toBe("queued");
      expect(second.runId).toBeTruthy();
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

  describe("startNextQueuedRunForAgent", () => {
    it("promotes a queued run to running", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
        maxConcurrentRuns: 1,
      });
      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1",
        projectId,
        invocationSource: "on_demand",
        status: "queued",
      }).returning();

      const claimed = await service.startNextQueuedRunForAgent("eng-1", projectId);
      expect(claimed).toHaveLength(1);
      expect(claimed[0].id).toBe(run.id);
      expect(claimed[0].status).toBe("running");
    });

    it("respects maxConcurrentRuns limit", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
        maxConcurrentRuns: 1,
      });

      // One already running
      await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1",
        projectId,
        invocationSource: "on_demand",
        status: "running",
        startedAt: new Date(),
      });

      // One queued
      await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1",
        projectId,
        invocationSource: "on_demand",
        status: "queued",
      });

      const claimed = await service.startNextQueuedRunForAgent("eng-1", projectId);
      expect(claimed).toHaveLength(0);
    });

    it("promotes multiple runs up to available slots", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
        maxConcurrentRuns: 3,
      });

      // Insert 3 queued runs
      for (let i = 0; i < 3; i++) {
        await testDb.db.insert(heartbeatRuns).values({
          agentId: "eng-1",
          projectId,
          invocationSource: "on_demand",
          status: "queued",
        });
      }

      const claimed = await service.startNextQueuedRunForAgent("eng-1", projectId);
      expect(claimed).toHaveLength(3);
    });

    it("skips if agent is no longer invokable", async () => {
      await testDb.db.insert(agents).values({
        id: "paused-1", projectId, name: "Paused", role: "engineer",
        status: "paused",
      });
      await testDb.db.insert(heartbeatRuns).values({
        agentId: "paused-1",
        projectId,
        invocationSource: "on_demand",
        status: "queued",
      });

      const claimed = await service.startNextQueuedRunForAgent("paused-1", projectId);
      expect(claimed).toHaveLength(0);
    });

    it("processes queued runs in FIFO order", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
        maxConcurrentRuns: 2,
      });

      const [first] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1",
        projectId,
        invocationSource: "on_demand",
        status: "queued",
      }).returning();

      // Small delay to ensure distinct timestamps
      await new Promise((r) => setTimeout(r, 10));

      const [second] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1",
        projectId,
        invocationSource: "on_demand",
        status: "queued",
      }).returning();

      const claimed = await service.startNextQueuedRunForAgent("eng-1", projectId);
      expect(claimed[0].id).toBe(first.id);
      expect(claimed[1].id).toBe(second.id);
    });
  });

  describe("executeRun", () => {
    it("executes a queued run to completion (happy path)", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
        promptTemplate: "Do your work, {{agent.name}}.",
        adapterType: "claude_local",
        adapterConfig: {},
      });

      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1",
        projectId,
        invocationSource: "on_demand",
        status: "queued",
      }).returning();

      await service.executeRun(run.id);

      // Run should now be in a terminal state
      const [finished] = await testDb.db
        .select()
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.id, run.id));

      expect(["succeeded", "failed"]).toContain(finished.status);
      expect(finished.finishedAt).toBeTruthy();
    });

    it("skips run if already in terminal state", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
      });

      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1",
        projectId,
        invocationSource: "on_demand",
        status: "succeeded",
        finishedAt: new Date(),
      }).returning();

      // Should not throw, just return
      await service.executeRun(run.id);

      const [same] = await testDb.db
        .select()
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.id, run.id));
      expect(same.status).toBe("succeeded");
    });

    it("releases task lock after execution completes", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
        adapterType: "claude_local",
        adapterConfig: {},
      });
      const [task] = await testDb.db.insert(tasks).values({
        projectId, title: "Lock Release Test",
      }).returning();

      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1",
        projectId,
        taskId: task.id,
        invocationSource: "on_demand",
        status: "queued",
      }).returning();

      // Set the lock
      await testDb.db.update(tasks).set({
        executionRunId: run.id,
        executionAgentId: "eng-1",
        executionLockedAt: new Date(),
      }).where(eq(tasks.id, task.id));

      await service.executeRun(run.id);

      // Lock should be released
      const [updated] = await testDb.db
        .select()
        .from(tasks)
        .where(eq(tasks.id, task.id));
      expect(updated.executionRunId).toBeNull();
      expect(updated.executionAgentId).toBeNull();
    });

    it("tracks run in activeRunExecutions during execution", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
        adapterType: "claude_local",
        adapterConfig: {},
      });
      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1",
        projectId,
        invocationSource: "on_demand",
        status: "queued",
      }).returning();

      // After execution, it should be removed from tracking
      await service.executeRun(run.id);
      expect(service.isRunActive(run.id)).toBe(false);
    });
  });

  describe("executeRun — error handling", () => {
    it("records timeout error when adapter returns timeout", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
        adapterType: "claude_local",
        adapterConfig: {},
      });
      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1",
        projectId,
        invocationSource: "on_demand",
        status: "running",
        startedAt: new Date(),
      }).returning();

      // Use a mock adapter that returns timeout
      const mockAdapter = {
        runAgent: async () => ({
          sessionId: null,
          model: null,
          result: null,
          usage: null,
          costUsd: null,
          billingType: "api" as const,
          exitCode: null,
          signal: "SIGTERM",
          error: "Process timed out after 300s",
          errorCode: "timeout" as const,
          events: [],
        }),
      };
      service.setAdapter(mockAdapter as any);

      await service.executeRun(run.id);

      const [finished] = await testDb.db
        .select()
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.id, run.id));
      expect(finished.status).toBe("timed_out");
      expect(finished.errorCode).toBe("timeout");
    });

    it("records success with cost and usage", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
        adapterType: "claude_local",
        adapterConfig: {},
      });
      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1",
        projectId,
        invocationSource: "on_demand",
        status: "running",
        startedAt: new Date(),
      }).returning();

      const mockAdapter = {
        runAgent: async () => ({
          sessionId: "sess_abc",
          model: "claude-sonnet-4-6",
          result: "Task completed successfully",
          usage: { input_tokens: 1000, output_tokens: 500 },
          costUsd: 0.05,
          billingType: "api" as const,
          exitCode: 0,
          signal: null,
          error: null,
          errorCode: null,
          events: [],
        }),
      };
      service.setAdapter(mockAdapter as any);

      await service.executeRun(run.id);

      const [finished] = await testDb.db
        .select()
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.id, run.id));

      expect(finished.status).toBe("succeeded");
      expect(finished.costUsd).toBe(0.05);
      expect(finished.model).toBe("claude-sonnet-4-6");
      expect(finished.sessionIdAfter).toBe("sess_abc");
      expect(finished.usageJson).toEqual({ input_tokens: 1000, output_tokens: 500 });
    });

    it("records failed status for non-zero exit code", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
        adapterType: "claude_local",
        adapterConfig: {},
      });
      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1",
        projectId,
        invocationSource: "on_demand",
        status: "running",
        startedAt: new Date(),
      }).returning();

      const mockAdapter = {
        runAgent: async () => ({
          sessionId: null,
          model: null,
          result: null,
          usage: null,
          costUsd: null,
          billingType: "api" as const,
          exitCode: 1,
          signal: null,
          error: "Process error",
          errorCode: "process_error" as const,
          events: [],
        }),
      };
      service.setAdapter(mockAdapter as any);

      await service.executeRun(run.id);

      const [finished] = await testDb.db
        .select()
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.id, run.id));
      expect(finished.status).toBe("failed");
      expect(finished.errorCode).toBe("process_error");
    });

    it("updates agent and project budget after successful run with cost", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-1", projectId, name: "Eng", role: "engineer",
        adapterType: "claude_local",
        adapterConfig: {},
        budgetSpentUsd: 1.0,
      });
      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "eng-1",
        projectId,
        invocationSource: "on_demand",
        status: "running",
        startedAt: new Date(),
      }).returning();

      const mockAdapter = {
        runAgent: async () => ({
          sessionId: null, model: null, result: "done",
          usage: null, costUsd: 0.25, billingType: "api" as const,
          exitCode: 0, signal: null, error: null, errorCode: null, events: [],
        }),
      };
      service.setAdapter(mockAdapter as any);

      await service.executeRun(run.id);

      const [agent] = await testDb.db
        .select()
        .from(agents)
        .where(eq(agents.id, "eng-1"));
      expect(agent.budgetSpentUsd).toBeCloseTo(1.25);

      const [project] = await testDb.db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId));
      expect(project.budgetSpentUsd).toBeCloseTo(0.25);
    });
  });

  describe("session compaction", () => {
    it("skips compaction when policy is disabled", async () => {
      const result = service.checkCompactionThresholds(
        { enabled: false, maxSessionRuns: 100, maxRawInputTokens: 2_000_000, maxSessionAgeHours: 72 },
        { runCount: 500, totalInputTokens: 5_000_000, sessionAgeHours: 100 },
      );
      expect(result.needsRotation).toBe(false);
    });

    it("triggers rotation when maxSessionRuns exceeded", () => {
      const result = service.checkCompactionThresholds(
        { enabled: true, maxSessionRuns: 200, maxRawInputTokens: 2_000_000, maxSessionAgeHours: 72 },
        { runCount: 201, totalInputTokens: 0, sessionAgeHours: 1 },
      );
      expect(result.needsRotation).toBe(true);
      expect(result.reason).toContain("maxSessionRuns");
    });

    it("triggers rotation when maxRawInputTokens exceeded", () => {
      const result = service.checkCompactionThresholds(
        { enabled: true, maxSessionRuns: 200, maxRawInputTokens: 2_000_000, maxSessionAgeHours: 72 },
        { runCount: 10, totalInputTokens: 2_000_001, sessionAgeHours: 1 },
      );
      expect(result.needsRotation).toBe(true);
      expect(result.reason).toContain("maxRawInputTokens");
    });

    it("triggers rotation when maxSessionAgeHours exceeded", () => {
      const result = service.checkCompactionThresholds(
        { enabled: true, maxSessionRuns: 200, maxRawInputTokens: 2_000_000, maxSessionAgeHours: 72 },
        { runCount: 10, totalInputTokens: 0, sessionAgeHours: 73 },
      );
      expect(result.needsRotation).toBe(true);
      expect(result.reason).toContain("maxSessionAgeHours");
    });

    it("does not trigger when all thresholds are within limits", () => {
      const result = service.checkCompactionThresholds(
        { enabled: true, maxSessionRuns: 200, maxRawInputTokens: 2_000_000, maxSessionAgeHours: 72 },
        { runCount: 100, totalInputTokens: 1_000_000, sessionAgeHours: 36 },
      );
      expect(result.needsRotation).toBe(false);
    });
  });
});
