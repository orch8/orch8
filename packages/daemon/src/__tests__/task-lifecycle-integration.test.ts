import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { projects, tasks, taskDependencies, comments } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { TaskService } from "../services/task.service.js";
import { TaskLifecycleService } from "../services/task-lifecycle.service.js";
import { WorktreeService, type ExecFn } from "../services/worktree.service.js";
import { CommentService } from "../services/comment.service.js";
import { TaskDispatcher } from "../services/task-dispatcher.service.js";

describe("Task Lifecycle Integration", () => {
  let testDb: TestDb;
  let taskService: TaskService;
  let lifecycleService: TaskLifecycleService;
  let commentService: CommentService;
  let dispatcher: TaskDispatcher;
  let execFn: ExecFn;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    taskService = new TaskService(testDb.db);
    execFn = vi.fn<ExecFn>().mockResolvedValue({ stdout: "", stderr: "" });
    const worktreeService = new WorktreeService(execFn);
    lifecycleService = new TaskLifecycleService(testDb.db, taskService, worktreeService);
    commentService = new CommentService(testDb.db);
    dispatcher = new TaskDispatcher(testDb.db);

    const [project] = await testDb.db.insert(projects).values({
      name: "Integration Test",
      slug: "integration-test",
      homeDir: "/tmp/int-test",
      worktreeDir: "/tmp/int-test-wt",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(comments);
    await testDb.db.delete(taskDependencies);
    await testDb.db.delete(tasks);
    vi.clearAllMocks();
  });

  it("quick task: full lifecycle backlog → in_progress → done", async () => {
    // Create task in backlog
    const task = await taskService.create({
      title: "Fix login bug",
      projectId,
      taskType: "quick",
      assignee: "engineer-1",
    });
    expect(task.column).toBe("backlog");

    // Get dispatch plan
    const plan = await dispatcher.plan(task);
    expect(plan.type).toBe("quick");
    expect(plan.needsWorktree).toBe(true);

    // Dispatch: backlog → in_progress
    const dispatched = await lifecycleService.transition(task.id, "in_progress", {
      agentId: "engineer-1",
      runId: "run-001",
    });
    expect(dispatched.column).toBe("in_progress");
    expect(dispatched.executionAgentId).toBe("engineer-1");
    expect(dispatched.worktreePath).toBeTruthy();

    // Agent adds a comment
    const comment = await commentService.create({
      taskId: task.id,
      author: "engineer-1",
      body: "Fixed the null check on line 42",
      type: "inline",
      lineRef: "src/auth.ts:42",
    });
    expect(comment.id).toMatch(/^cmt_/);

    // Agent completes: in_progress → done
    const done = await lifecycleService.transition(task.id, "done");
    expect(done.column).toBe("done");
    expect(done.executionAgentId).toBeNull();
  });

  it("dependency resolution: completing a task unblocks dependents", async () => {
    const dep = await taskService.create({
      title: "Dependency",
      projectId,
      taskType: "quick",
    });
    const blocked = await taskService.create({
      title: "Blocked work",
      projectId,
      taskType: "quick",
    });

    await taskService.addDependency(blocked.id, dep.id);
    await testDb.db.update(tasks).set({ column: "blocked" }).where(eq(tasks.id, blocked.id));
    await testDb.db.update(tasks).set({
      column: "in_progress",
      executionAgentId: "agent-1",
      executionRunId: "run-1",
    }).where(eq(tasks.id, dep.id));

    // Complete the dependency: in_progress → done
    await lifecycleService.transition(dep.id, "done");

    // Blocked task should now be in backlog
    const unblocked = await taskService.getById(blocked.id);
    expect(unblocked!.column).toBe("backlog");
  });

  it("invalid transitions are rejected at every stage", async () => {
    const task = await taskService.create({
      title: "Guarded",
      projectId,
      taskType: "quick",
    });

    // backlog → done (skip in_progress)
    await expect(
      lifecycleService.transition(task.id, "done"),
    ).rejects.toThrow("Invalid transition");
  });
});
