import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { projects, agents, tasks, comments } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { VerificationService } from "../services/verification.service.js";
import { CommentService } from "../services/comment.service.js";

describe("Verification E2E Flow", () => {
  let testDb: TestDb;
  let verificationService: VerificationService;
  let commentService: CommentService;
  let projectId: string;
  let wakeups: Array<{ agentId: string; taskId: string; reason: string }>;

  beforeAll(async () => {
    testDb = await setupTestDb();
    commentService = new CommentService(testDb.db);
    wakeups = [];

    verificationService = new VerificationService(
      testDb.db,
      commentService,
      async (agentId, _projectId, taskId, reason) => {
        wakeups.push({ agentId, taskId, reason });
      },
    );

    const [project] = await testDb.db.insert(projects).values({
      name: "E2E Test",
      slug: "e2e-test",
      homeDir: "/tmp/e2e-test",
      worktreeDir: "/tmp/e2e-wt",
      verificationRequired: true,
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values([
      { id: "verifier-1", projectId, name: "Verifier", role: "verifier" },
      { id: "eng-1", projectId, name: "Engineer", role: "engineer" },
      { id: "referee-1", projectId, name: "Referee", role: "referee" },
    ]);
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(comments);
    await testDb.db.delete(tasks);
    wakeups = [];
  });

  it("happy path: review -> verify PASS -> done", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Happy path task",
      column: "review",
      assignee: "eng-1",
    }).returning();

    // Step 1: Spawn verifier
    await verificationService.spawnVerifier(task.id, "verifier-1");

    let [updated] = await testDb.db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(updated.column).toBe("verification");
    expect(wakeups).toHaveLength(1);
    expect(wakeups[0].agentId).toBe("verifier-1");

    // Step 2: Verifier submits PASS
    const result = await verificationService.submitVerdict(task.id, {
      result: "pass",
      report: "All tests pass. No issues found.",
    });

    expect(result.action).toBe("done");
    [updated] = await testDb.db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(updated.column).toBe("done");
    expect(updated.verificationResult).toBe("pass");
  });

  it("dispute path: verify FAIL -> implementer disagrees -> referee PASS -> done", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Dispute path task",
      column: "review",
      assignee: "eng-1",
    }).returning();

    // Step 1: Spawn verifier
    await verificationService.spawnVerifier(task.id, "verifier-1");

    // Step 2: Verifier submits FAIL
    const verdictResult = await verificationService.submitVerdict(task.id, {
      result: "fail",
      report: "Missing error handling in API route.",
    });
    expect(verdictResult.action).toBe("awaiting_implementer");

    // Step 3: Implementer disagrees
    const implResult = await verificationService.submitImplementerResponse(task.id, {
      agrees: false,
      response: "The error handling is upstream in middleware.",
    });
    expect(implResult.action).toBe("referee_needed");

    // Step 4: Spawn referee
    await verificationService.spawnReferee(task.id, "referee-1");
    expect(wakeups).toHaveLength(2); // verifier + referee

    // Step 5: Referee sides with implementer
    const refereeResult = await verificationService.submitRefereeVerdict(task.id, {
      result: "pass",
      report: "Implementer is correct — middleware handles the error.",
    });
    expect(refereeResult.action).toBe("done");

    const [updated] = await testDb.db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(updated.column).toBe("done");
    expect(updated.verificationResult).toBe("pass");
    expect(updated.refereeVerdict).toContain("middleware handles");
  });

  it("fix path: verify FAIL -> implementer agrees -> back to in_progress", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Fix path task",
      column: "review",
      assignee: "eng-1",
    }).returning();

    await verificationService.spawnVerifier(task.id, "verifier-1");

    await verificationService.submitVerdict(task.id, {
      result: "fail",
      report: "Race condition in concurrent handler.",
    });

    const implResult = await verificationService.submitImplementerResponse(task.id, {
      agrees: true,
      response: "Good catch, fixing now.",
    });
    expect(implResult.action).toBe("in_progress");

    const [updated] = await testDb.db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(updated.column).toBe("in_progress");
    expect(updated.verificationResult).toBeNull();
  });

  it("partial path: verify PARTIAL -> referee PARTIAL -> done with caveats", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Partial path task",
      column: "review",
      assignee: "eng-1",
    }).returning();

    await verificationService.spawnVerifier(task.id, "verifier-1");

    const verdictResult = await verificationService.submitVerdict(task.id, {
      result: "partial",
      report: "Core logic works but edge case unhandled.",
    });
    expect(verdictResult.action).toBe("referee_needed");

    await verificationService.spawnReferee(task.id, "referee-1");

    const refereeResult = await verificationService.submitRefereeVerdict(task.id, {
      result: "partial",
      report: "Edge case is rare — ship with known caveat.",
    });
    expect(refereeResult.action).toBe("done_with_caveats");

    const [updated] = await testDb.db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(updated.column).toBe("done");
    expect(updated.verificationResult).toBe("partial");
  });

  it("generates proper comment trail through full flow", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Comment trail task",
      column: "review",
      assignee: "eng-1",
    }).returning();

    await verificationService.spawnVerifier(task.id, "verifier-1");

    await verificationService.submitVerdict(task.id, {
      result: "fail",
      report: "Issue found.",
    });

    await verificationService.submitImplementerResponse(task.id, {
      agrees: false,
      response: "Disagree.",
    });

    await verificationService.spawnReferee(task.id, "referee-1");

    await verificationService.submitRefereeVerdict(task.id, {
      result: "pass",
      report: "Implementer is right.",
    });

    const taskComments = await commentService.listByTask(task.id, { type: "verification" });
    expect(taskComments).toHaveLength(3); // verifier + implementer + referee

    expect(taskComments[0].author).toBe("system:verifier");
    expect(taskComments[1].author).toContain("agent:");
    expect(taskComments[2].author).toBe("system:referee");
  });
});
