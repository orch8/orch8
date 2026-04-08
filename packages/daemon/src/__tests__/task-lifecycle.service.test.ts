import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { projects, tasks, taskDependencies } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { TaskLifecycleService } from "../services/task-lifecycle.service.js";
import { TaskService } from "../services/task.service.js";
import { WorktreeService, type ExecFn } from "../services/worktree.service.js";

describe("TaskLifecycleService", () => {
  let testDb: TestDb;
  let taskService: TaskService;
  let execFn: ExecFn;
  let worktreeService: WorktreeService;
  let lifecycleService: TaskLifecycleService;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    taskService = new TaskService(testDb.db);
    execFn = vi.fn<ExecFn>().mockResolvedValue({ stdout: "", stderr: "" });
    worktreeService = new WorktreeService(execFn);

    const [project] = await testDb.db.insert(projects).values({
      name: "Lifecycle Test",
      slug: "lifecycle-test",
      homeDir: "/tmp/lifecycle",
      worktreeDir: "/tmp/lifecycle-wt",
    }).returning();
    projectId = project.id;

    lifecycleService = new TaskLifecycleService(
      testDb.db,
      taskService,
      worktreeService,
    );
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(taskDependencies);
    await testDb.db.delete(tasks);
    vi.clearAllMocks();
  });

  describe("transition", () => {
    it("moves a backlog task to in_progress", async () => {
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

    it("creates a worktree when moving quick task to in_progress", async () => {
      const task = await taskService.create({
        title: "Worktree task",
        projectId,
        taskType: "quick",
      });

      const updated = await lifecycleService.transition(task.id, "in_progress", {
        agentId: "agent-1",
        runId: "run-1",
      });

      expect(execFn).toHaveBeenCalledWith(
        "git",
        expect.arrayContaining(["worktree", "add"]),
        expect.any(Object),
      );
      expect(updated.worktreePath).toMatch(/task-task_/);
      expect(updated.branch).toMatch(/^task\//);
    });

    it("does NOT create a worktree for brainstorm tasks", async () => {
      const task = await taskService.create({
        title: "Brainstorm task",
        projectId,
        taskType: "brainstorm",
      });

      await lifecycleService.transition(task.id, "in_progress", {
        agentId: "agent-1",
        runId: "run-1",
      });

      expect(execFn).not.toHaveBeenCalled();
    });

    it("leaves no dangling execution lock if worktree creation fails", async () => {
      // Force the worktree create step to throw. Because worktree creation runs
      // BEFORE the DB update, a failure here must leave the task with no
      // execution lock and no worktree path / branch.
      (execFn as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("git worktree add failed"),
      );

      const task = await taskService.create({
        title: "Worktree will fail",
        projectId,
        taskType: "quick",
      });

      await expect(
        lifecycleService.transition(task.id, "in_progress", {
          agentId: "agent-1",
          runId: "run-1",
        }),
      ).rejects.toThrow("git worktree add failed");

      const reloaded = await taskService.getById(task.id);
      expect(reloaded!.column).toBe("backlog");
      expect(reloaded!.executionAgentId).toBeNull();
      expect(reloaded!.executionRunId).toBeNull();
      expect(reloaded!.executionLockedAt).toBeNull();
      expect(reloaded!.worktreePath).toBeNull();
      expect(reloaded!.branch).toBeNull();
    });

    it("skips worktree creation if task already has a worktree path", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Rework",
        taskType: "quick",
        column: "backlog",
        worktreePath: "/tmp/lifecycle-wt/task-existing",
        branch: "task/existing/rework",
      }).returning();

      // backlog → in_progress (re-dispatch with existing worktree)
      await lifecycleService.transition(task.id, "in_progress", {
        agentId: "agent-1",
        runId: "run-1",
      });

      // Should NOT call git worktree add — worktree already exists
      expect(execFn).not.toHaveBeenCalledWith(
        "git",
        expect.arrayContaining(["worktree", "add"]),
        expect.any(Object),
      );
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

    it("moves in_progress to done, removes worktree, and unblocks dependents", async () => {
      // Create a blocked task that depends on the first
      const main = await taskService.create({
        title: "Main task",
        projectId,
        taskType: "quick",
      });
      const blocked = await taskService.create({
        title: "Blocked task",
        projectId,
        taskType: "quick",
      });

      await taskService.addDependency(blocked.id, main.id);
      await testDb.db.update(tasks).set({ column: "blocked" }).where(eq(tasks.id, blocked.id));
      await testDb.db.update(tasks).set({
        column: "in_progress",
        executionAgentId: "agent-1",
        executionRunId: "run-1",
        worktreePath: "/tmp/lifecycle-wt/task-main",
        branch: "task/main/main-task",
      }).where(eq(tasks.id, main.id));

      const updated = await lifecycleService.transition(main.id, "done");

      expect(updated.column).toBe("done");

      // Worktree should be removed
      expect(execFn).toHaveBeenCalledWith(
        "git",
        expect.arrayContaining(["worktree", "remove"]),
        expect.any(Object),
      );

      // Blocked task should be unblocked
      const refreshedBlocked = await taskService.getById(blocked.id);
      expect(refreshedBlocked!.column).toBe("backlog");
    });

    it("rejects invalid transitions", async () => {
      const task = await taskService.create({
        title: "Invalid",
        projectId,
        taskType: "quick",
      });

      await expect(
        lifecycleService.transition(task.id, "done"),
      ).rejects.toThrow("Invalid transition: backlog → done");
    });

    it("rejects transition on nonexistent task", async () => {
      await expect(
        lifecycleService.transition("task_nonexistent", "in_progress"),
      ).rejects.toThrow("Task not found");
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
      const task = await taskService.create({
        title: "Need lock",
        projectId,
        taskType: "quick",
      });

      await expect(
        lifecycleService.transition(task.id, "in_progress"),
      ).rejects.toThrow("agentId and runId are required");
    });
  });

  describe("checkout", () => {
    it("checks out a backlog task: sets lock, transitions to in_progress, creates worktree", async () => {
      const task = await taskService.create({
        title: "Checkout me",
        projectId,
        taskType: "quick",
      });

      const updated = await lifecycleService.checkout(task.id, "agent-1", "run-1");

      expect(updated.column).toBe("in_progress");
      expect(updated.executionAgentId).toBe("agent-1");
      expect(updated.executionRunId).toBe("run-1");
      expect(updated.executionLockedAt).not.toBeNull();
      expect(execFn).toHaveBeenCalledWith(
        "git",
        expect.arrayContaining(["worktree", "add"]),
        expect.any(Object),
      );
    });

    it("checks out a blocked task: transitions to in_progress", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Blocked task",
        taskType: "quick",
        column: "blocked",
      }).returning();

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

      await expect(
        lifecycleService.checkout(task.id, "agent-1", "run-1"),
      ).rejects.toThrow("Checkout conflict");
    });

    it("rejects checkout on a done task", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Done task",
        taskType: "quick",
        column: "done",
      }).returning();

      await expect(
        lifecycleService.checkout(task.id, "agent-1", "run-1"),
      ).rejects.toThrow("Cannot checkout completed task");
    });

    it("rejects checkout on nonexistent task", async () => {
      await expect(
        lifecycleService.checkout("task_nonexistent", "agent-1", "run-1"),
      ).rejects.toThrow("Task not found");
    });

    it("sets lock on unlocked in_progress task without re-transitioning", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Unlocked in-progress",
        taskType: "quick",
        column: "in_progress",
        worktreePath: "/tmp/lifecycle-wt/task-existing",
        branch: "task/existing/unlocked",
      }).returning();

      const updated = await lifecycleService.checkout(task.id, "agent-1", "run-1");

      expect(updated.column).toBe("in_progress");
      expect(updated.executionAgentId).toBe("agent-1");
      expect(updated.executionRunId).toBe("run-1");
      expect(updated.executionLockedAt).not.toBeNull();
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
      expect(updated.executionRunId).toBeNull();
      expect(updated.executionLockedAt).toBeNull();
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

      await expect(
        lifecycleService.release(task.id, "agent-1"),
      ).rejects.toThrow("does not hold execution lock");
    });

    it("rejects release on nonexistent task", async () => {
      await expect(
        lifecycleService.release("task_nonexistent", "agent-1"),
      ).rejects.toThrow("Task not found");
    });
  });
});
