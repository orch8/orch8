import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { projects, agents, heartbeatRuns, wakeupRequests } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { SchedulerService } from "../services/scheduler.service.js";
import { HeartbeatService } from "../services/heartbeat.service.js";
import { BroadcastService } from "../services/broadcast.service.js";

describe("SchedulerService tickTimers", () => {
  let testDb: TestDb;
  let heartbeatService: HeartbeatService;
  let scheduler: SchedulerService;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Tick Test",
      slug: "tick-test",
      homeDir: "/tmp/tick-test",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    scheduler?.stop();
    heartbeatService?.shutdown();
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(wakeupRequests);
    await testDb.db.delete(heartbeatRuns);
    await testDb.db.delete(agents);

    const sockets = new Set() as unknown as Set<import("ws").WebSocket>;
    const broadcastService = new BroadcastService(sockets);
    heartbeatService = new HeartbeatService(testDb.db, broadcastService);
    scheduler = new SchedulerService(testDb.db, heartbeatService, {
      intervalMs: 60_000,
      stalenessThresholdMs: 5 * 60 * 1000,
    });
  });

  it("wakes agents whose heartbeat interval has elapsed", async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    await testDb.db.insert(agents).values({
      id: "eng-timer",
      projectId,
      name: "Timer Engineer",
      role: "engineer",
      heartbeatEnabled: true,
      heartbeatIntervalSec: 60, // 1 minute
      lastHeartbeat: fiveMinAgo,
    });

    const woken = await scheduler.tickTimers();
    expect(woken).toHaveLength(1);
    expect(woken[0].agentId).toBe("eng-timer");
  });

  it("skips agents with heartbeatEnabled = false", async () => {
    await testDb.db.insert(agents).values({
      id: "eng-no-timer",
      projectId,
      name: "No Timer",
      role: "engineer",
      heartbeatEnabled: false,
      heartbeatIntervalSec: 60,
      lastHeartbeat: new Date(Date.now() - 5 * 60 * 1000),
    });

    const woken = await scheduler.tickTimers();
    expect(woken).toHaveLength(0);
  });

  it("skips agents whose interval has not elapsed", async () => {
    await testDb.db.insert(agents).values({
      id: "eng-recent",
      projectId,
      name: "Recent",
      role: "engineer",
      heartbeatEnabled: true,
      heartbeatIntervalSec: 3600, // 1 hour
      lastHeartbeat: new Date(), // just now
    });

    const woken = await scheduler.tickTimers();
    expect(woken).toHaveLength(0);
  });

  it("skips paused agents", async () => {
    await testDb.db.insert(agents).values({
      id: "eng-paused",
      projectId,
      name: "Paused",
      role: "engineer",
      status: "paused",
      heartbeatEnabled: true,
      heartbeatIntervalSec: 60,
      lastHeartbeat: new Date(Date.now() - 5 * 60 * 1000),
    });

    const woken = await scheduler.tickTimers();
    expect(woken).toHaveLength(0);
  });

  it("wakes agents with null lastHeartbeat (never run)", async () => {
    await testDb.db.insert(agents).values({
      id: "eng-never",
      projectId,
      name: "Never Run",
      role: "engineer",
      heartbeatEnabled: true,
      heartbeatIntervalSec: 60,
      lastHeartbeat: null,
    });

    const woken = await scheduler.tickTimers();
    expect(woken).toHaveLength(1);
  });
});
