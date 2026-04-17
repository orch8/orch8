import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { projects, agents, tasks, taskDependencies, heartbeatRuns, wakeupRequests } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { HeartbeatService } from "../services/heartbeat.service.js";
import { SchedulerService } from "../services/scheduler.service.js";
import { TaskService } from "../services/task.service.js";
import { BroadcastService } from "../services/broadcast.service.js";

describe("Wiring: Scheduler Unblock Dispatch", () => {
  let testDb: TestDb;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    const [project] = await testDb.db.insert(projects).values({
      name: "Scheduler Test",
      slug: "scheduler-test",
      homeDir: "/tmp/sched-test",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(wakeupRequests);
    await testDb.db.delete(heartbeatRuns);
    await testDb.db.delete(taskDependencies);
    await testDb.db.delete(tasks);
    await testDb.db.delete(agents);
  });

  it("enqueues wakeup for assigned agent when task is unblocked", async () => {
    await testDb.db.insert(agents).values({
      id: "agent-1",
      projectId,
      name: "Worker",
      role: "engineer",
      status: "active",
      wakeOnAutomation: true,
      maxConcurrentRuns: 2,
    });

    // Task A is done (the blocker)
    const [taskA] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Task A",
      taskType: "quick",
      column: "done",
    }).returning();

    // Task B is blocked, assigned to agent-1
    const [taskB] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Task B",
      taskType: "quick",
      column: "blocked",
      assignee: "agent-1",
    }).returning();

    // B depends on A
    await testDb.db.insert(taskDependencies).values({
      taskId: taskB.id,
      dependsOnId: taskA.id,
    });

    const sockets = new Set() as unknown as Set<import("ws").WebSocket>;
    const broadcastService = new BroadcastService(sockets);
    const heartbeatService = new HeartbeatService(testDb.db, broadcastService);
    vi.spyOn(heartbeatService, "executeRun").mockResolvedValue();

    const enqueueSpy = vi.spyOn(heartbeatService, "enqueueWakeup");

    const scheduler = new SchedulerService(testDb.db, heartbeatService, {
      intervalMs: 60_000,
      stalenessThresholdMs: 300_000,
    });

    const taskService = new TaskService(testDb.db);
    scheduler.setTaskService(taskService);

    await scheduler.tick();

    expect(enqueueSpy).toHaveBeenCalledWith("agent-1", projectId, expect.objectContaining({
      source: "automation",
      taskId: taskB.id,
      reason: "task_unblocked",
    }));
  });
});
