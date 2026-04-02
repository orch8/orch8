import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import Fastify from "fastify";
import { projects, agents, heartbeatRuns, wakeupRequests, tasks } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { HeartbeatService } from "../services/heartbeat.service.js";
import { BroadcastService } from "../services/broadcast.service.js";
import { WorktreeService } from "../services/worktree.service.js";
import { authPlugin } from "../api/middleware/auth.js";
import { taskRoutes } from "../api/routes/tasks.js";
import { agentRoutes } from "../api/routes/agents.js";
import { AgentService } from "../services/agent.service.js";
import { TaskService } from "../services/task.service.js";
import { TaskLifecycleService } from "../services/task-lifecycle.service.js";
import "../types.js";

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

  describe("P0 #2: enqueueTaskScopedWakeup creates queued run", () => {
    it("creates a queued run for the task without transitioning it", async () => {
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

      // Task should remain in backlog (agents checkout tasks themselves now)
      const [updated] = await testDb.db
        .select()
        .from(tasks)
        .where(eq(tasks.id, task.id));
      expect(updated.column).toBe("backlog");
    });
  });

  describe("P0 #2: worktree resolution in executeRun", () => {
    it("does not create worktree lazily (agents handle via checkout)", async () => {
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

      // Worktree should NOT be created lazily — agents handle this via checkout
      expect(mockWorktreeService.create).not.toHaveBeenCalled();

      // Task should not have worktreePath set (no lazy creation)
      const [updated] = await testDb.db
        .select()
        .from(tasks)
        .where(eq(tasks.id, task.id));
      expect(updated.worktreePath).toBeNull();
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

  describe("P0 #3: POST /api/tasks with assignee triggers dispatch", () => {
    it("enqueues wakeup when task created with assignee", async () => {
      await testDb.db.insert(agents).values({
        id: "agent-1",
        projectId,
        name: "Worker",
        role: "engineer",
        status: "active",
        wakeOnAssignment: true,
        maxConcurrentRuns: 2,
      });

      const sockets = new Set() as unknown as Set<import("ws").WebSocket>;
      const broadcastService = new BroadcastService(sockets);
      const heartbeatService = new HeartbeatService(testDb.db, broadcastService);
      vi.spyOn(heartbeatService, "executeRun").mockResolvedValue();

      const enqueueSpy = vi.spyOn(heartbeatService, "enqueueWakeup");

      const app = Fastify();
      app.decorate("db", testDb.db);
      app.decorate("heartbeatService", heartbeatService);

      const taskService = new TaskService(testDb.db);
      app.decorate("taskService", taskService);

      const worktreeService = new WorktreeService();
      const lifecycleService = new TaskLifecycleService(testDb.db, taskService, worktreeService);
      app.decorate("lifecycleService", lifecycleService);

      app.register(authPlugin);
      app.register(taskRoutes);
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { "x-project-id": projectId },
        payload: {
          projectId,
          title: "Build feature",
          taskType: "quick",
          assignee: "agent-1",
        },
      });

      expect(response.statusCode).toBe(201);
      expect(enqueueSpy).toHaveBeenCalledWith("agent-1", projectId, expect.objectContaining({
        source: "assignment",
        reason: "task_created_with_assignee",
      }));

      await app.close();
    });
  });

  describe("P0 #2: PATCH /api/tasks/:id with assignee triggers dispatch", () => {
    it("enqueues wakeup when assignee set on backlog task", async () => {
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
        title: "Existing task",
        taskType: "quick",
        column: "backlog",
      }).returning();

      const sockets = new Set() as unknown as Set<import("ws").WebSocket>;
      const broadcastService = new BroadcastService(sockets);
      const heartbeatService = new HeartbeatService(testDb.db, broadcastService);
      vi.spyOn(heartbeatService, "executeRun").mockResolvedValue();

      const enqueueSpy = vi.spyOn(heartbeatService, "enqueueWakeup");

      const app = Fastify();
      app.decorate("db", testDb.db);
      app.decorate("heartbeatService", heartbeatService);

      const taskService = new TaskService(testDb.db);
      app.decorate("taskService", taskService);

      const worktreeService = new WorktreeService();
      const lifecycleService = new TaskLifecycleService(testDb.db, taskService, worktreeService);
      app.decorate("lifecycleService", lifecycleService);

      app.register(authPlugin);
      app.register(taskRoutes);
      await app.ready();

      const response = await app.inject({
        method: "PATCH",
        url: `/api/tasks/${task.id}`,
        headers: { "x-project-id": projectId },
        payload: { assignee: "agent-1" },
      });

      expect(response.statusCode).toBe(200);
      expect(enqueueSpy).toHaveBeenCalledWith("agent-1", projectId, expect.objectContaining({
        source: "assignment",
        taskId: task.id,
        reason: "task_assigned",
      }));

      await app.close();
    });

    it("does NOT enqueue when task is not in backlog", async () => {
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
        title: "In-progress task",
        taskType: "quick",
        column: "in_progress",
      }).returning();

      const sockets = new Set() as unknown as Set<import("ws").WebSocket>;
      const broadcastService = new BroadcastService(sockets);
      const heartbeatService = new HeartbeatService(testDb.db, broadcastService);

      const enqueueSpy = vi.spyOn(heartbeatService, "enqueueWakeup");

      const app = Fastify();
      app.decorate("db", testDb.db);
      app.decorate("heartbeatService", heartbeatService);

      const taskService = new TaskService(testDb.db);
      app.decorate("taskService", taskService);

      const worktreeService = new WorktreeService();
      const lifecycleService = new TaskLifecycleService(testDb.db, taskService, worktreeService);
      app.decorate("lifecycleService", lifecycleService);

      app.register(authPlugin);
      app.register(taskRoutes);
      await app.ready();

      await app.inject({
        method: "PATCH",
        url: `/api/tasks/${task.id}`,
        headers: { "x-project-id": projectId },
        payload: { assignee: "agent-1" },
      });

      expect(enqueueSpy).not.toHaveBeenCalled();

      await app.close();
    });
  });

  describe("P0 #4: executeRun transitions task on completion", () => {
    it("calls onRunCompleted with taskId and succeeded status", async () => {
      await testDb.db.insert(agents).values({
        id: "agent-1",
        projectId,
        name: "Worker",
        role: "engineer",
        status: "active",
        maxConcurrentRuns: 1,
      });

      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Test task",
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

      service.setAdapter({
        runAgent: vi.fn().mockResolvedValue({
          exitCode: 0,
          result: "done",
          costUsd: 0,
        }),
      } as any);

      const onRunCompleted = vi.fn().mockResolvedValue(undefined);
      service.setOnRunCompleted(onRunCompleted);

      await service.executeRun(run.id);

      expect(onRunCompleted).toHaveBeenCalledWith(task.id, "succeeded");
    });

    it("does NOT call onRunCompleted when run fails", async () => {
      await testDb.db.insert(agents).values({
        id: "agent-1",
        projectId,
        name: "Worker",
        role: "engineer",
        status: "active",
        maxConcurrentRuns: 1,
      });

      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Test task",
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

      service.setAdapter({
        runAgent: vi.fn().mockResolvedValue({
          exitCode: 1,
          error: "something failed",
          costUsd: 0,
        }),
      } as any);

      const onRunCompleted = vi.fn();
      service.setOnRunCompleted(onRunCompleted);

      await service.executeRun(run.id);

      expect(onRunCompleted).not.toHaveBeenCalled();
    });
  });

  describe("P1 #7: agent resume picks up backlog tasks", () => {
    it("enqueues wakeups for tasks assigned to resumed agent", async () => {
      await testDb.db.insert(agents).values({
        id: "agent-1",
        projectId,
        name: "Worker",
        role: "engineer",
        status: "paused",
        pauseReason: "manual",
        wakeOnAutomation: true,
        maxConcurrentRuns: 2,
      });

      // Two tasks in backlog assigned to this agent
      await testDb.db.insert(tasks).values([
        { projectId, title: "Task A", taskType: "quick", column: "backlog", assignee: "agent-1" },
        { projectId, title: "Task B", taskType: "quick", column: "backlog", assignee: "agent-1" },
        { projectId, title: "Task C", taskType: "quick", column: "in_progress", assignee: "agent-1" },
      ]);

      const sockets = new Set() as unknown as Set<import("ws").WebSocket>;
      const broadcastService = new BroadcastService(sockets);
      const heartbeatService = new HeartbeatService(testDb.db, broadcastService);
      vi.spyOn(heartbeatService, "executeRun").mockResolvedValue();
      const enqueueSpy = vi.spyOn(heartbeatService, "enqueueWakeup");

      const agentService = new AgentService(testDb.db, broadcastService);
      const taskService = new TaskService(testDb.db);

      const app = Fastify();
      app.decorate("db", testDb.db);
      app.decorate("agentService", agentService);
      app.decorate("heartbeatService", heartbeatService);
      app.decorate("taskService", taskService);
      app.decorate("broadcastService", broadcastService);

      app.register(authPlugin);
      app.register(agentRoutes);
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: "/api/agents/agent-1/resume",
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(200);

      // Should have enqueued wakeups for the 2 backlog tasks, not the in_progress one
      const wakeupCalls = enqueueSpy.mock.calls.filter(
        (call) => call[2]?.reason === "agent_resumed",
      );
      expect(wakeupCalls).toHaveLength(2);

      await app.close();
    });
  });
});
