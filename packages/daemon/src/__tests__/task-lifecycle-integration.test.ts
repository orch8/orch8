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

  it("quick task: full lifecycle backlog → in_progress → review → verification → done", async () => {
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

    // Agent completes: in_progress → review
    const reviewed = await lifecycleService.transition(task.id, "review");
    expect(reviewed.column).toBe("review");
    expect(reviewed.executionAgentId).toBeNull();

    // QA approves: review → verification
    const verifying = await lifecycleService.transition(task.id, "verification");
    expect(verifying.column).toBe("verification");

    // Verifier passes: verification → done
    const done = await lifecycleService.transition(task.id, "done");
    expect(done.column).toBe("done");
  });

  it("verification rejection: verification → in_progress → review cycle", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Flaky impl",
      taskType: "quick",
      column: "verification",
      worktreePath: "/tmp/int-test-wt/task-existing",
      branch: "task/existing/flaky-impl",
    }).returning();

    // Verifier fails: verification → in_progress
    const reworked = await lifecycleService.transition(task.id, "in_progress", {
      agentId: "engineer-1",
      runId: "run-002",
    });
    expect(reworked.column).toBe("in_progress");
    // Worktree should NOT be recreated
    expect(execFn).not.toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["worktree", "add"]),
      expect.any(Object),
    );

    // Agent fixes: in_progress → review
    const reviewed = await lifecycleService.transition(task.id, "review");
    expect(reviewed.column).toBe("review");
  });

  it("QA rejection: review → in_progress with comment", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Bad impl",
      taskType: "quick",
      column: "review",
      worktreePath: "/tmp/int-test-wt/task-bad",
      branch: "task/bad/bad-impl",
    }).returning();

    // QA leaves rejection comment
    await commentService.create({
      taskId: task.id,
      author: "qa-agent",
      body: "Edge case not handled",
      type: "inline",
    });

    // Reject: review → in_progress
    const reworked = await lifecycleService.transition(task.id, "in_progress", {
      agentId: "engineer-1",
      runId: "run-003",
    });
    expect(reworked.column).toBe("in_progress");
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
    await testDb.db.update(tasks).set({ column: "verification" }).where(eq(tasks.id, dep.id));

    // Complete the dependency: verification → done
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

    // backlog → done (skip everything)
    await expect(
      lifecycleService.transition(task.id, "done"),
    ).rejects.toThrow("Invalid transition");

    // backlog → review (skip in_progress)
    await expect(
      lifecycleService.transition(task.id, "review"),
    ).rejects.toThrow("Invalid transition");

    // backlog → verification
    await expect(
      lifecycleService.transition(task.id, "verification"),
    ).rejects.toThrow("Invalid transition");
  });
});
