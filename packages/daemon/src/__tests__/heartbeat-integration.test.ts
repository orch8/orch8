import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
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
      worktreeDir: "/tmp/integration-wt",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    service?.shutdown();
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

  it("concurrent wakeups: second wakeup coalesces", async () => {
    await testDb.db.insert(agents).values({
      id: "cto-1",
      projectId,
      name: "CTO",
      role: "cto",
      heartbeatEnabled: true,
      maxConcurrentRuns: 1,
    });

    // First timer wakeup
    const wake1 = await service.enqueueWakeup("cto-1", projectId, {
      source: "timer",
    });
    expect(wake1.status).toBe("queued");

    // Second timer wakeup while first is still queued/running
    const wake2 = await service.enqueueWakeup("cto-1", projectId, {
      source: "timer",
    });
    expect(wake2.status).toBe("coalesced");
  });
});
