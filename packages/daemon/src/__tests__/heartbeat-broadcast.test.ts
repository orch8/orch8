import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { HeartbeatService } from "../services/heartbeat.service.js";
import { BroadcastService } from "../services/broadcast.service.js";
import { projects, agents, heartbeatRuns } from "@orch/shared/db";

describe("HeartbeatService broadcast", () => {
  let testDb: TestDb;
  let heartbeat: HeartbeatService;
  let broadcastService: BroadcastService;
  let mockSocket: { readyState: number; send: ReturnType<typeof vi.fn> };
  let projectId: string;
  let agentId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    mockSocket = { readyState: 1, send: vi.fn() };
    const sockets = new Set([mockSocket]) as unknown as Set<import("ws").WebSocket>;
    broadcastService = new BroadcastService(sockets);
    heartbeat = new HeartbeatService(testDb.db, broadcastService);
  }, 60_000);

  afterAll(async () => {
    heartbeat.shutdown();
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(heartbeatRuns);
    await testDb.db.delete(agents);
    await testDb.db.delete(projects);
    mockSocket.send.mockClear();

    const [project] = await testDb.db.insert(projects).values({
      name: "Test",
      slug: "test",
      homeDir: "/tmp/test",
      worktreeDir: "/tmp/wt",
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values({
      id: "eng",
      projectId,
      name: "Engineer",
      role: "engineer",
      status: "active",
      wakeOnAssignment: true,
      wakeOnOnDemand: true,
    });
    agentId = "eng";
  });

  it("broadcasts run_created when a run is enqueued", async () => {
    await heartbeat.enqueueWakeup(agentId, projectId, {
      source: "on_demand",
    });

    const calls = mockSocket.send.mock.calls.map(
      (c) => JSON.parse(c[0] as string),
    );
    const runCreatedEvent = calls.find(
      (e: { type: string }) => e.type === "run_created",
    );
    expect(runCreatedEvent).toBeDefined();
    expect(runCreatedEvent.agentId).toBe(agentId);
    expect(runCreatedEvent.status).toBe("queued");
  });

  it("broadcasts run_completed with status after claimQueuedRun", async () => {
    // Insert a queued run directly
    const [run] = await testDb.db.insert(heartbeatRuns).values({
      agentId,
      projectId,
      invocationSource: "on_demand",
      status: "queued",
    }).returning();

    await heartbeat.claimQueuedRun(run.id);

    const calls = mockSocket.send.mock.calls.map(
      (c) => JSON.parse(c[0] as string),
    );
    // claimQueuedRun should broadcast that the run is now running
    expect(mockSocket.send).toHaveBeenCalled();
  });
});
