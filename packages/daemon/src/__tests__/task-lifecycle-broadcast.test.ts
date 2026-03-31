import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { TaskLifecycleService } from "../services/task-lifecycle.service.js";
import { TaskService } from "../services/task.service.js";
import { WorktreeService } from "../services/worktree.service.js";
import { BroadcastService } from "../services/broadcast.service.js";
import { projects, tasks, agents } from "@orch/shared/db";

describe("TaskLifecycleService broadcast", () => {
  let testDb: TestDb;
  let service: TaskLifecycleService;
  let broadcastService: BroadcastService;
  let mockSocket: { readyState: number; send: ReturnType<typeof vi.fn> };
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    const taskService = new TaskService(testDb.db);
    const worktreeService = new WorktreeService();
    mockSocket = { readyState: 1, send: vi.fn() };
    const sockets = new Set([mockSocket]) as unknown as Set<import("ws").WebSocket>;
    broadcastService = new BroadcastService(sockets);

    service = new TaskLifecycleService(testDb.db, taskService, worktreeService, {}, broadcastService);
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(tasks);
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
  });

  it("broadcasts task_transitioned on column change", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Test task",
      taskType: "quick",
      column: "in_progress",
    }).returning();

    await service.transition(task.id, "review");

    expect(mockSocket.send).toHaveBeenCalledOnce();
    const payload = JSON.parse(mockSocket.send.mock.calls[0][0]);
    expect(payload.type).toBe("task_transitioned");
    expect(payload.taskId).toBe(task.id);
    expect(payload.from).toBe("in_progress");
    expect(payload.to).toBe("review");
  });
});
