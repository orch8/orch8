import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { projects, agents, heartbeatRuns, wakeupRequests } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { HeartbeatService } from "../services/heartbeat.service.js";
import { BroadcastService } from "../services/broadcast.service.js";

describe("HeartbeatService idempotency", () => {
  let testDb: TestDb;
  let heartbeat: HeartbeatService;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Idem Test",
      slug: "idem-test",
      homeDir: "/tmp/idem",
      worktreeDir: "/tmp/idem-wt",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    heartbeat?.shutdown();
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(wakeupRequests);
    await testDb.db.delete(heartbeatRuns);
    await testDb.db.delete(agents);

    await testDb.db.insert(agents).values({
      id: "eng-1",
      projectId,
      name: "Engineer",
      role: "engineer",
    });

    const sockets = new Set() as unknown as Set<import("ws").WebSocket>;
    const broadcastService = new BroadcastService(sockets);
    heartbeat = new HeartbeatService(testDb.db, broadcastService);
    // Use a never-resolving adapter so fire-and-forget runs stay "running"
    heartbeat.setAdapter({ runAgent: () => new Promise(() => {}) } as any);
  });

  it("deduplicates wakeups with the same idempotencyKey", async () => {
    const first = await heartbeat.enqueueWakeup("eng-1", projectId, {
      source: "on_demand",
      reason: "first",
      idempotencyKey: "key-123",
    });
    expect(first.status).toBe("queued");

    const second = await heartbeat.enqueueWakeup("eng-1", projectId, {
      source: "on_demand",
      reason: "duplicate",
      idempotencyKey: "key-123",
    });
    expect(second.status).toBe("coalesced");
  });

  it("allows different idempotency keys", async () => {
    const first = await heartbeat.enqueueWakeup("eng-1", projectId, {
      source: "on_demand",
      idempotencyKey: "key-aaa",
    });
    expect(first.status).toBe("queued");

    const second = await heartbeat.enqueueWakeup("eng-1", projectId, {
      source: "on_demand",
      idempotencyKey: "key-bbb",
    });
    // Second is coalesced because there's already a queued/running run for the agent,
    // NOT because of idempotency — different key
    expect(second.status).toBe("coalesced");
  });

  it("does not deduplicate when no idempotencyKey is provided", async () => {
    const first = await heartbeat.enqueueWakeup("eng-1", projectId, {
      source: "on_demand",
    });
    expect(first.status).toBe("queued");

    // Second call without key — coalesced by general wakeup logic, not idempotency
    const second = await heartbeat.enqueueWakeup("eng-1", projectId, {
      source: "on_demand",
    });
    expect(second.status).toBe("coalesced");
  });
});
