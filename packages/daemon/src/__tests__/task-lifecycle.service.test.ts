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

    it("skips worktree creation if task already has a worktree path", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Rework",
        taskType: "quick",
        column: "review",
        worktreePath: "/tmp/lifecycle-wt/task-existing",
        branch: "task/existing/rework",
      }).returning();

      // review → in_progress (rejection)
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

    it("moves in_progress to review and clears execution lock", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Review me",
        taskType: "quick",
        column: "in_progress",
        executionAgentId: "agent-1",
        executionRunId: "run-1",
        executionLockedAt: new Date(),
      }).returning();

      const updated = await lifecycleService.transition(task.id, "review");

      expect(updated.column).toBe("review");
      expect(updated.executionAgentId).toBeNull();
      expect(updated.executionRunId).toBeNull();
      expect(updated.executionLockedAt).toBeNull();
    });

    it("moves verification to done, removes worktree, and unblocks dependents", async () => {
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
        column: "verification",
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
});
