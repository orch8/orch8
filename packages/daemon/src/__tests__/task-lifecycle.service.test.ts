import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { projects, tasks, taskDependencies } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { TaskLifecycleService } from "../services/task-lifecycle.service.js";
import { TaskService } from "../services/task.service.js";

describe("TaskLifecycleService", () => {
  let testDb: TestDb;
  let taskService: TaskService;
  let lifecycleService: TaskLifecycleService;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    taskService = new TaskService(testDb.db);

    const [project] = await testDb.db.insert(projects).values({
      name: "Lifecycle Test",
      slug: "lifecycle-test",
      homeDir: "/tmp/lifecycle",
    }).returning();
    projectId = project.id;

    lifecycleService = new TaskLifecycleService(testDb.db, taskService);
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(taskDependencies);
    await testDb.db.delete(tasks);
  });

  describe("transition", () => {
    it("moves a backlog task to in_progress and sets the execution lock", async () => {
      const task = await taskService.create({
        title: "Test task",
        projectId,
        taskType: "quick",
      });

      const updated = await lifecycleService.transition(task.id, "in_progress", {
        agentId: "agent-1",
        runId: "run-1",
      });

      expect(updated.column).toBe("in_progress");
      expect(updated.executionAgentId).toBe("agent-1");
      expect(updated.executionRunId).toBe("run-1");
      expect(updated.executionLockedAt).not.toBeNull();
    });

    it("moves in_progress to done and clears execution lock", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Complete me",
        taskType: "quick",
        column: "in_progress",
        executionAgentId: "agent-1",
        executionRunId: "run-1",
        executionLockedAt: new Date(),
      }).returning();

      const updated = await lifecycleService.transition(task.id, "done");

      expect(updated.column).toBe("done");
      expect(updated.executionAgentId).toBeNull();
      expect(updated.executionRunId).toBeNull();
      expect(updated.executionLockedAt).toBeNull();
    });

    it("unblocks dependent tasks when a dependency is marked done", async () => {
      const main = await taskService.create({ title: "Main", projectId, taskType: "quick" });
      const blocked = await taskService.create({ title: "Blocked", projectId, taskType: "quick" });
      await taskService.addDependency(blocked.id, main.id);
      await testDb.db.update(tasks).set({ column: "blocked" }).where(eq(tasks.id, blocked.id));
      await testDb.db.update(tasks).set({
        column: "in_progress",
        executionAgentId: "agent-1",
        executionRunId: "run-1",
      }).where(eq(tasks.id, main.id));

      await lifecycleService.transition(main.id, "done");

      const refreshedBlocked = await taskService.getById(blocked.id);
      expect(refreshedBlocked!.column).toBe("backlog");
    });

    it("rejects invalid transitions", async () => {
      const task = await taskService.create({ title: "Invalid", projectId, taskType: "quick" });
      await expect(lifecycleService.transition(task.id, "done"))
        .rejects.toThrow("Invalid transition: backlog → done");
    });

    it("rejects transition on nonexistent task", async () => {
      await expect(lifecycleService.transition("task_nonexistent", "in_progress"))
        .rejects.toThrow("Task not found");
    });

    it("moves in_progress to blocked and clears execution lock", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Block me",
        taskType: "quick",
        column: "in_progress",
        executionAgentId: "agent-1",
        executionRunId: "run-1",
        executionLockedAt: new Date(),
      }).returning();

      const updated = await lifecycleService.transition(task.id, "blocked");

      expect(updated.column).toBe("blocked");
      expect(updated.executionAgentId).toBeNull();
      expect(updated.executionRunId).toBeNull();
      expect(updated.executionLockedAt).toBeNull();
    });

    it("requires agentId and runId when moving to in_progress", async () => {
      const task = await taskService.create({ title: "Need lock", projectId, taskType: "quick" });
      await expect(lifecycleService.transition(task.id, "in_progress"))
        .rejects.toThrow("agentId and runId are required");
    });
  });

  describe("checkout", () => {
    it("checks out a backlog task", async () => {
      const task = await taskService.create({ title: "Checkout me", projectId, taskType: "quick" });
      const updated = await lifecycleService.checkout(task.id, "agent-1", "run-1");
      expect(updated.column).toBe("in_progress");
      expect(updated.executionAgentId).toBe("agent-1");
    });

    it("is idempotent when same agent already holds lock", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Already mine",
        taskType: "quick",
        column: "in_progress",
        executionAgentId: "agent-1",
        executionRunId: "run-1",
        executionLockedAt: new Date(),
      }).returning();

      const updated = await lifecycleService.checkout(task.id, "agent-1", "run-2");
      expect(updated.id).toBe(task.id);
      expect(updated.executionAgentId).toBe("agent-1");
    });

    it("returns 409-style error when locked by another agent", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Someone else's",
        taskType: "quick",
        column: "in_progress",
        executionAgentId: "agent-other",
        executionRunId: "run-other",
        executionLockedAt: new Date(),
      }).returning();

      await expect(lifecycleService.checkout(task.id, "agent-1", "run-1"))
        .rejects.toThrow("Checkout conflict");
    });

    it("rejects checkout on a done task", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Done task",
        taskType: "quick",
        column: "done",
      }).returning();

      await expect(lifecycleService.checkout(task.id, "agent-1", "run-1"))
        .rejects.toThrow("Cannot checkout completed task");
    });

    it("rejects checkout on nonexistent task", async () => {
      await expect(lifecycleService.checkout("task_nonexistent", "agent-1", "run-1"))
        .rejects.toThrow("Task not found");
    });
  });

  describe("release", () => {
    it("clears execution lock", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Release me",
        taskType: "quick",
        column: "in_progress",
        executionAgentId: "agent-1",
        executionRunId: "run-1",
        executionLockedAt: new Date(),
      }).returning();

      const updated = await lifecycleService.release(task.id, "agent-1");
      expect(updated.column).toBe("in_progress");
      expect(updated.executionAgentId).toBeNull();
    });

    it("rejects release by non-lock-holder", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Not yours",
        taskType: "quick",
        column: "in_progress",
        executionAgentId: "agent-other",
        executionRunId: "run-other",
        executionLockedAt: new Date(),
      }).returning();

      await expect(lifecycleService.release(task.id, "agent-1"))
        .rejects.toThrow("does not hold execution lock");
    });

    it("rejects release on nonexistent task", async () => {
      await expect(lifecycleService.release("task_nonexistent", "agent-1"))
        .rejects.toThrow("Task not found");
    });
  });
});
