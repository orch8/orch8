import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { projects, agents, heartbeatRuns, wakeupRequests, tasks } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { HeartbeatService } from "../services/heartbeat.service.js";
import { BroadcastService } from "../services/broadcast.service.js";
import { WorktreeService } from "../services/worktree.service.js";

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

  describe("P0 #2: enqueueTaskScopedWakeup sets column to in_progress", () => {
    it("transitions task from backlog to in_progress when claiming", async () => {
      await testDb.db.insert(agents).values({
        id: "agent-1",
        projectId,
        name: "Worker",
        role: "engineer",
        status: "active",
        wakeOnAssignment: true,
        maxConcurrentRuns: 2,
      });

      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Test task",
        taskType: "quick",
        column: "backlog",
      }).returning();

      const sockets = new Set() as unknown as Set<import("ws").WebSocket>;
      const broadcastService = new BroadcastService(sockets);
      const service = new HeartbeatService(testDb.db, broadcastService);
      vi.spyOn(service, "executeRun").mockResolvedValue();

      await service.enqueueWakeup("agent-1", projectId, {
        source: "assignment",
        taskId: task.id,
        reason: "task_assigned",
      });

      // Task should now be in_progress
      const [updated] = await testDb.db
        .select()
        .from(tasks)
        .where(eq(tasks.id, task.id));
      expect(updated.column).toBe("in_progress");
    });
  });

  describe("P0 #2: lazy worktree creation in executeRun", () => {
    it("creates worktree when task has no worktreePath", async () => {
      await testDb.db.insert(agents).values({
        id: "agent-1",
        projectId,
        name: "Worker",
        role: "engineer",
        status: "active",
        wakeOnAssignment: true,
        maxConcurrentRuns: 1,
      });

      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Build login form",
        taskType: "quick",
        column: "in_progress",
      }).returning();

      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "agent-1",
        projectId,
        taskId: task.id,
        invocationSource: "assignment",
        status: "running",
        startedAt: new Date(),
      }).returning();

      const sockets = new Set() as unknown as Set<import("ws").WebSocket>;
      const broadcastService = new BroadcastService(sockets);
      const service = new HeartbeatService(testDb.db, broadcastService);

      const mockWorktreeService = {
        create: vi.fn().mockResolvedValue("/tmp/wiring-wt/task-" + task.id),
        remove: vi.fn().mockResolvedValue(undefined),
      } as unknown as WorktreeService;
      service.setWorktreeService(mockWorktreeService);

      // Mock adapter to avoid real execution
      service.setAdapter({
        runAgent: vi.fn().mockResolvedValue({
          exitCode: 0,
          result: "done",
          costUsd: 0,
        }),
      } as any);

      await service.executeRun(run.id);

      expect(mockWorktreeService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          homeDir: "/tmp/wiring-test",
          worktreeDir: "/tmp/wiring-wt",
          taskId: task.id,
        }),
      );

      // Task should have worktreePath set
      const [updated] = await testDb.db
        .select()
        .from(tasks)
        .where(eq(tasks.id, task.id));
      expect(updated.worktreePath).toBe("/tmp/wiring-wt/task-" + task.id);
      expect(updated.branch).toMatch(/^task\//);
    });

    it("skips worktree creation for brainstorm tasks", async () => {
      await testDb.db.insert(agents).values({
        id: "agent-1",
        projectId,
        name: "Worker",
        role: "researcher",
        status: "active",
        maxConcurrentRuns: 1,
      });

      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Explore options",
        taskType: "brainstorm",
        column: "in_progress",
      }).returning();

      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "agent-1",
        projectId,
        taskId: task.id,
        invocationSource: "assignment",
        status: "running",
        startedAt: new Date(),
      }).returning();

      const sockets = new Set() as unknown as Set<import("ws").WebSocket>;
      const broadcastService = new BroadcastService(sockets);
      const service = new HeartbeatService(testDb.db, broadcastService);

      const mockWorktreeService = {
        create: vi.fn(),
        remove: vi.fn(),
      } as unknown as WorktreeService;
      service.setWorktreeService(mockWorktreeService);

      service.setAdapter({
        runAgent: vi.fn().mockResolvedValue({
          exitCode: 0,
          result: "done",
          costUsd: 0,
        }),
      } as any);

      await service.executeRun(run.id);

      expect(mockWorktreeService.create).not.toHaveBeenCalled();
    });
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
