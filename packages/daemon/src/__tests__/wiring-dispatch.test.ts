import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { projects, agents, heartbeatRuns, wakeupRequests, tasks } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { HeartbeatService } from "../services/heartbeat.service.js";
import { BroadcastService } from "../services/broadcast.service.js";

describe("Wiring: Dispatch", () => {
  let testDb: TestDb;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    const [project] = await testDb.db.insert(projects).values({
      name: "Wiring Test",
      slug: "wiring-test",
      homeDir: "/tmp/wiring-test",
      worktreeDir: "/tmp/wiring-wt",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(wakeupRequests);
    await testDb.db.delete(heartbeatRuns);
    await testDb.db.delete(tasks);
    await testDb.db.delete(agents);
  });

  describe("P0 #1: startNextQueuedRunForAgent calls executeRun", () => {
    it("fires executeRun for each claimed run", async () => {
      await testDb.db.insert(agents).values({
        id: "agent-1",
        projectId,
        name: "Worker",
        role: "engineer",
        status: "active",
        wakeOnAssignment: true,
        maxConcurrentRuns: 2,
      });

      // Insert a queued run directly
      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "agent-1",
        projectId,
        invocationSource: "assignment",
        status: "queued",
      }).returning();

      const sockets = new Set() as unknown as Set<import("ws").WebSocket>;
      const broadcastService = new BroadcastService(sockets);
      const service = new HeartbeatService(testDb.db, broadcastService);

      // Spy on executeRun
      const executeRunSpy = vi.spyOn(service, "executeRun").mockResolvedValue();

      const claimed = await service.startNextQueuedRunForAgent("agent-1", projectId);

      expect(claimed).toHaveLength(1);
      expect(claimed[0].id).toBe(run.id);
      expect(executeRunSpy).toHaveBeenCalledWith(run.id);
    });
  });
});
