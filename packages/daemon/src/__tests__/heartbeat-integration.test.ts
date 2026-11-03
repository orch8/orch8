import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { useAsyncWork } from "./helpers/async-work.js";
import { eq } from "drizzle-orm";
import {
  projects, agents, heartbeatRuns, wakeupRequests, tasks,
} from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { HeartbeatService } from "../services/heartbeat.service.js";
import { BroadcastService } from "../services/broadcast.service.js";

async function waitForRunComplete(db: TestDb["db"], runId: string, timeoutMs = 2000) {
  return vi.waitFor(
    async () => {
      const [r] = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, runId));
      expect(r).toBeDefined();
      expect(["queued", "running"]).not.toContain(r.status);
      return r;
    },
    { timeout: timeoutMs },
  );
}

describe("Heartbeat Pipeline Integration", () => {
  const work = useAsyncWork(HeartbeatService.prototype, "executeRun", () => service?.shutdown());
  let testDb: TestDb;
  let service: HeartbeatService;
  let projectId: string;
  let mockSocket: { readyState: number; send: ReturnType<typeof vi.fn> };


  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Integration Test",
      slug: "integration-test",
      homeDir: "/tmp/integration-test",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    mockSocket = { readyState: 1, send: vi.fn() };
    await testDb.db.delete(wakeupRequests);
    await testDb.db.delete(heartbeatRuns);
    await testDb.db.delete(tasks);
    await testDb.db.delete(agents);
    await testDb.db.update(projects).set({
      budgetPaused: false,
      budgetLimitUsd: null,
      budgetSpentUsd: 0,
    });

    const sockets = new Set([mockSocket]) as unknown as Set<import("ws").WebSocket>;
    const broadcastService = new BroadcastService(sockets);
    service = new HeartbeatService(testDb.db, broadcastService);
    service.setLogger(work.logger);
    service.setErrorLogger(work.errorLogger as any);
  });

  it("full pipeline: enqueue → promote → claim → execute (with mock adapter)", async () => {
    await testDb.db.insert(agents).values({
      id: "eng-1",
      projectId,
      name: "Pipeline Eng",
      role: "engineer",
      maxConcurrentRuns: 1,
      adapterType: "claude_local",
      adapterConfig: {},
    });

    // Mock adapter that returns a successful result
    const mockAdapter = {
      runAgent: async () => ({
        sessionId: "sess_123",
        model: "claude-sonnet-4-6",
        result: "Work completed",
        usage: { input_tokens: 500, output_tokens: 200 },
        costUsd: 0.02,
        billingType: "api" as const,
        exitCode: 0,
        signal: null,
        error: null,
        errorCode: null,
        events: [],
      }),
    };
    service.setAdapter(mockAdapter as any);

    // Enqueue — creates run as queued, then startNextQueuedRunForAgent claims and executes it
    const wakeup = await service.enqueueWakeup("eng-1", projectId, {
      source: "on_demand",
      reason: "integration test",
    });
    expect(wakeup.status).toBe("queued");
    expect(wakeup.runId).toBeTruthy();

    // Wait for the fire-and-forget executeRun to complete
    await waitForRunComplete(testDb.db, wakeup.runId!);

    await work.drain();

    // Check final run state
    const allRuns = await testDb.db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.agentId, "eng-1"));

    expect(allRuns).toHaveLength(1);
    const run = allRuns[0];
    expect(run.status).toBe("succeeded");
    expect(run.costUsd).toBe(0.02);
    expect(run.sessionIdAfter).toBe("sess_123");

    // Budget should be updated
    const [agent] = await testDb.db
      .select()
      .from(agents)
      .where(eq(agents.id, "eng-1"));
    expect(agent.budgetSpentUsd).toBeCloseTo(0.02);

    // Broadcasts should include status changes
    expect(mockSocket.send).toHaveBeenCalled();
  });

  it("task-scoped pipeline: both agents get queued runs for same task", async () => {
    await testDb.db.insert(agents).values([
      { id: "eng-1", projectId, name: "Eng 1", role: "engineer" as const, adapterType: "claude_local", adapterConfig: {} },
      { id: "eng-2", projectId, name: "Eng 2", role: "engineer" as const, adapterType: "claude_local", adapterConfig: {} },
    ]);
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Shared Task",
    }).returning();

    const mockAdapter = {
      runAgent: async () => ({
        sessionId: null, model: null, result: "done",
        usage: null, costUsd: null, billingType: "api" as const,
        exitCode: 0, signal: null, error: null, errorCode: null, events: [],
      }),
    };
    service.setAdapter(mockAdapter as any);

    // Agent 1 wakes the task — run created as queued, executeRun fires in background
    const wake1 = await service.enqueueWakeup("eng-1", projectId, {
      source: "on_demand",
      taskId: task.id,
    });
    expect(wake1.status).toBe("queued");

    // Agent 2 wakes the same task — also gets a queued run (no deferral)
    const wake2 = await service.enqueueWakeup("eng-2", projectId, {
      source: "on_demand",
      taskId: task.id,
    });
    expect(wake2.status).toBe("queued");

    // Wait for both fire-and-forget executions to complete
    await waitForRunComplete(testDb.db, wake1.runId!);
    await waitForRunComplete(testDb.db, wake2.runId!);

    await work.drain();

    // Verify both agents succeeded
    const eng1Runs = await testDb.db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.agentId, "eng-1"));
    expect(eng1Runs).toHaveLength(1);
    expect(eng1Runs[0].status).toBe("succeeded");

    const eng2Runs = await testDb.db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.agentId, "eng-2"));
    expect(eng2Runs.length).toBeGreaterThanOrEqual(1);
    expect(eng2Runs[0].status).toBe("succeeded");
  });

  it("detects swallowed late task-lock cleanup failure even when executeRun resolves", async () => {
    await testDb.db.insert(agents).values({
      id: "cleanup-probe", projectId, name: "Cleanup probe", role: "engineer",
      adapterType: "claude_local", adapterConfig: {},
    });
    const gate = work.gate();
    service.setAdapter({ runAgent: async () => {
      await gate.hold();
      return {
        sessionId: null, model: null, result: "done", usage: null,
        costUsd: null, billingType: "api", exitCode: 0, signal: null,
        error: null, errorCode: null, events: [],
      };
    } } as any);
    const wake = await service.enqueueWakeup("cleanup-probe", projectId, { source: "on_demand" });
    await gate.entered;
    const execution = vi.mocked((HeartbeatService.prototype as any).executeRun).mock.results[0].value;
    const release = vi.spyOn(service, "releaseTaskLock").mockRejectedValue(new Error("deliberate late cleanup failure"));
    try {
      await testDb.db.insert(tasks).values({ projectId, title: "Locked", executionRunId: wake.runId });
      gate.release();
      // The real service catches the injected failure and still fulfills its promise.
      await expect(execution).resolves.toBeUndefined();
      const [run] = await testDb.db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, wake.runId!));
      expect(run.status).toBe("succeeded");
      expect(release).toHaveBeenCalledTimes(1);
      await expect(work.drain()).rejects.toThrow(/Unexpected service errors:.*lock_release_failed.*Failed to release task locks/);
      expect(work.pendingCount).toBe(0);
    } finally {
      gate.release();
      try { await execution; } finally { release.mockRestore(); }
    }
  });

  it("concurrent wakeups: second wakeup coalesces", async () => {
    await testDb.db.insert(agents).values({
      id: "cto-1",
      projectId,
      name: "CTO",
      role: "cto",
      heartbeatEnabled: true,
      maxConcurrentRuns: 1,
    });

    const gate = work.gate();
    const adapter = { runAgent: vi.fn(async () => {
      await gate.hold();
      return {
        sessionId: null, model: null, result: "done", usage: null,
        costUsd: null, billingType: "api", exitCode: 0, signal: null,
        error: null, errorCode: null, events: [],
      };
    }) };
    service.setAdapter(adapter as any);

    // First timer wakeup
    const wake1 = await service.enqueueWakeup("cto-1", projectId, {
      source: "timer",
    });
    expect(wake1.status).toBe("queued");

    await gate.entered;
    try {
    // Second timer wakeup while first is still queued/running
    const wake2 = await service.enqueueWakeup("cto-1", projectId, {
      source: "timer",
    });
    expect(wake2.status).toBe("coalesced");
    // Coalesced wake receipts do not carry a runId; the existing run remains authoritative.
    expect(wake2.runId).toBeNull();
    const runs = await testDb.db.select().from(heartbeatRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe(wake1.runId);
    expect(runs[0].status).toBe("running");
    expect(adapter.runAgent).toHaveBeenCalledTimes(1);
    } finally {
      gate.release();
      await work.drain();
    }
    expect(adapter.runAgent).toHaveBeenCalledTimes(1);
    expect(work.pendingCount).toBe(0);
    const [first] = await testDb.db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, wake1.runId!));
    expect(first.status).toBe("succeeded");
    const wake3 = await service.enqueueWakeup("cto-1", projectId, { source: "timer" });
    expect(wake3.status).toBe("queued");
    expect(wake3.runId).not.toBe(wake1.runId);
    await work.drain();
    expect(adapter.runAgent).toHaveBeenCalledTimes(2);
    const [third] = await testDb.db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, wake3.runId!));
    expect(third.status).toBe("succeeded");
  });
});
