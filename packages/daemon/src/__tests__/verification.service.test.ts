import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { projects, agents, tasks, comments } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { VerificationService } from "../services/verification.service.js";
import { TaskService } from "../services/task.service.js";
import { WorktreeService } from "../services/worktree.service.js";
import { TaskLifecycleService } from "../services/task-lifecycle.service.js";
import { CommentService } from "../services/comment.service.js";

describe("VerificationService", () => {
  let testDb: TestDb;
  let verificationService: VerificationService;
  let lifecycleService: TaskLifecycleService;
  let commentService: CommentService;
  let projectId: string;
  let verifierAgentId: string;
  let implementerAgentId: string;
  let refereeAgentId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    const taskService = new TaskService(testDb.db);
    const worktreeService = new WorktreeService();
    lifecycleService = new TaskLifecycleService(testDb.db, taskService, worktreeService);
    commentService = new CommentService(testDb.db);

    // We pass a no-op wakeup function — tests verify state, not spawning
    verificationService = new VerificationService(
      testDb.db,
      commentService,
      async () => {}, // enqueueVerifierWakeup stub
    );

    const [project] = await testDb.db.insert(projects).values({
      name: "Verification Test",
      slug: "verif-test",
      homeDir: "/tmp/verif-test",
      worktreeDir: "/tmp/verif-wt",
      verificationRequired: true,
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values([
      { id: "verifier-1", projectId, name: "Verifier", role: "verifier" },
      { id: "eng-1", projectId, name: "Engineer", role: "engineer" },
      { id: "referee-1", projectId, name: "Referee", role: "referee" },
    ]);
    verifierAgentId = "verifier-1";
    implementerAgentId = "eng-1";
    refereeAgentId = "referee-1";
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(comments);
    await testDb.db.delete(tasks);
  });

  // --- submitVerdict tests ---

  it("submitVerdict with PASS transitions task to done", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Test task",
      column: "verification",
      assignee: implementerAgentId,
    }).returning();

    const result = await verificationService.submitVerdict(task.id, {
      result: "pass",
      report: "All checks passed. Code is correct.",
    });

    expect(result.action).toBe("done");

    const [updated] = await testDb.db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(updated.column).toBe("done");
    expect(updated.verificationResult).toBe("pass");
    expect(updated.verifierReport).toContain("All checks passed");
  });

  it("submitVerdict with FAIL returns awaiting_implementer", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Failing task",
      column: "verification",
      assignee: implementerAgentId,
    }).returning();

    const result = await verificationService.submitVerdict(task.id, {
      result: "fail",
      report: "Missing null check in handler.",
    });

    expect(result.action).toBe("awaiting_implementer");

    const [updated] = await testDb.db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(updated.column).toBe("verification");
    expect(updated.verificationResult).toBe("fail");
    expect(updated.verifierReport).toContain("null check");
  });

  it("submitVerdict with PARTIAL returns referee_needed", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Partial task",
      column: "verification",
      assignee: implementerAgentId,
    }).returning();

    const result = await verificationService.submitVerdict(task.id, {
      result: "partial",
      report: "Core logic works but edge case unhandled.",
    });

    expect(result.action).toBe("referee_needed");
  });

  it("submitVerdict creates a verification comment", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Comment task",
      column: "verification",
    }).returning();

    await verificationService.submitVerdict(task.id, {
      result: "pass",
      report: "Looks good.",
    });

    const taskComments = await commentService.listByTask(task.id, { type: "verification" });
    expect(taskComments).toHaveLength(1);
    expect(taskComments[0].author).toBe("system:verifier");
    expect(taskComments[0].body).toContain("PASS");
  });

  // --- submitImplementerResponse tests ---

  it("implementer agrees → task moves to in_progress", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Disputed task",
      column: "verification",
      verificationResult: "fail",
      verifierReport: "Found race condition.",
      assignee: implementerAgentId,
    }).returning();

    const result = await verificationService.submitImplementerResponse(task.id, {
      agrees: true,
      response: "You're right, I'll fix it.",
    });

    expect(result.action).toBe("in_progress");

    const [updated] = await testDb.db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(updated.column).toBe("in_progress");
    expect(updated.verificationResult).toBeNull();
  });

  it("implementer disagrees → referee_needed", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Disputed task 2",
      column: "verification",
      verificationResult: "fail",
      verifierReport: "Found issue.",
      assignee: implementerAgentId,
    }).returning();

    const result = await verificationService.submitImplementerResponse(task.id, {
      agrees: false,
      response: "This is a false positive, the verifier misread the code.",
    });

    expect(result.action).toBe("referee_needed");

    const [updated] = await testDb.db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(updated.column).toBe("verification");
  });

  it("implementer response creates a verification comment", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Response comment task",
      column: "verification",
      verificationResult: "fail",
      verifierReport: "Issue found.",
      assignee: implementerAgentId,
    }).returning();

    await verificationService.submitImplementerResponse(task.id, {
      agrees: true,
      response: "Acknowledged.",
    });

    const taskComments = await commentService.listByTask(task.id, { type: "verification" });
    expect(taskComments).toHaveLength(1);
    expect(taskComments[0].body).toContain("Acknowledged");
  });

  // --- submitRefereeVerdict tests ---

  it("referee PASS → task done", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Referee pass task",
      column: "verification",
      verificationResult: "fail",
      verifierReport: "Found issue.",
    }).returning();

    const result = await verificationService.submitRefereeVerdict(task.id, {
      result: "pass",
      report: "Implementer is correct, verifier was wrong.",
    });

    expect(result.action).toBe("done");

    const [updated] = await testDb.db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(updated.column).toBe("done");
    expect(updated.verificationResult).toBe("pass");
    expect(updated.refereeVerdict).toContain("Implementer is correct");
  });

  it("referee FAIL → task back to in_progress", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Referee fail task",
      column: "verification",
      verificationResult: "fail",
      verifierReport: "Found issue.",
    }).returning();

    const result = await verificationService.submitRefereeVerdict(task.id, {
      result: "fail",
      report: "Verifier is correct, code needs fixing.",
    });

    expect(result.action).toBe("in_progress");

    const [updated] = await testDb.db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(updated.column).toBe("in_progress");
    expect(updated.verificationResult).toBeNull();
    expect(updated.refereeVerdict).toBeNull();
  });

  it("referee PARTIAL → task done with caveats", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Referee partial task",
      column: "verification",
      verificationResult: "partial",
      verifierReport: "Edge case unhandled.",
    }).returning();

    const result = await verificationService.submitRefereeVerdict(task.id, {
      result: "partial",
      report: "Acceptable for now, edge case is low-priority.",
    });

    expect(result.action).toBe("done_with_caveats");

    const [updated] = await testDb.db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(updated.column).toBe("done");
    expect(updated.verificationResult).toBe("partial");
    expect(updated.refereeVerdict).toContain("Acceptable for now");
  });

  it("referee verdict creates a verification comment", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Referee comment task",
      column: "verification",
      verificationResult: "fail",
    }).returning();

    await verificationService.submitRefereeVerdict(task.id, {
      result: "pass",
      report: "All good.",
    });

    const taskComments = await commentService.listByTask(task.id, { type: "verification" });
    expect(taskComments).toHaveLength(1);
    expect(taskComments[0].author).toBe("system:referee");
  });

  // --- spawnVerifier test ---

  it("spawnVerifier transitions task to verification and calls enqueue", async () => {
    let wakeupCalled = false;
    let capturedAgentId = "";
    let capturedTaskId = "";

    const service = new VerificationService(
      testDb.db,
      commentService,
      async (agentId, _projectId, taskId, _reason) => {
        wakeupCalled = true;
        capturedAgentId = agentId;
        capturedTaskId = taskId;
      },
    );

    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Spawn verifier task",
      column: "review",
    }).returning();

    await service.spawnVerifier(task.id, verifierAgentId);

    expect(wakeupCalled).toBe(true);
    expect(capturedAgentId).toBe(verifierAgentId);
    expect(capturedTaskId).toBe(task.id);

    const [updated] = await testDb.db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(updated.column).toBe("verification");
  });

  // --- Error handling ---

  it("submitVerdict throws for missing task", async () => {
    await expect(
      verificationService.submitVerdict("task_nonexistent", {
        result: "pass",
        report: "ok",
      }),
    ).rejects.toThrow("Task not found");
  });
});
