import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { projects, agents, tasks, heartbeatRuns, wakeupRequests } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { VerificationService } from "../services/verification.service.js";
import { CommentService } from "../services/comment.service.js";

describe("Wiring: Verification Re-Dispatch", () => {
  let testDb: TestDb;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    const [project] = await testDb.db.insert(projects).values({
      name: "Verification Test",
      slug: "verification-test",
      homeDir: "/tmp/verify-test",
      worktreeDir: "/tmp/verify-wt",
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

  it("wakes implementer when they agree with FAIL verdict", async () => {
    await testDb.db.insert(agents).values({
      id: "impl-1",
      projectId,
      name: "Implementer",
      role: "implementer",
      status: "active",
      wakeOnAutomation: true,
      maxConcurrentRuns: 1,
    });

    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Fix bug",
      taskType: "quick",
      column: "verification",
      assignee: "impl-1",
      verificationResult: "fail",
    }).returning();

    const enqueueWakeup = vi.fn().mockResolvedValue(undefined);
    const commentService = new CommentService(testDb.db);
    const service = new VerificationService(testDb.db, commentService, enqueueWakeup);

    const result = await service.submitImplementerResponse(task.id, {
      agrees: true,
      response: "You're right, I'll fix it",
    });

    expect(result.action).toBe("in_progress");
    expect(enqueueWakeup).toHaveBeenCalledWith(
      "impl-1", projectId, task.id, "verification_fix_needed",
    );
  });

  it("wakes implementer after referee FAIL verdict", async () => {
    await testDb.db.insert(agents).values({
      id: "impl-1",
      projectId,
      name: "Implementer",
      role: "implementer",
      status: "active",
      wakeOnAutomation: true,
      maxConcurrentRuns: 1,
    });

    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Fix bug",
      taskType: "quick",
      column: "verification",
      assignee: "impl-1",
      verificationResult: "fail",
    }).returning();

    const enqueueWakeup = vi.fn().mockResolvedValue(undefined);
    const commentService = new CommentService(testDb.db);
    const service = new VerificationService(testDb.db, commentService, enqueueWakeup);

    const result = await service.submitRefereeVerdict(task.id, {
      result: "fail",
      report: "Implementer needs to redo work",
    });

    expect(result.action).toBe("in_progress");
    expect(enqueueWakeup).toHaveBeenCalledWith(
      "impl-1", projectId, task.id, "referee_ordered_fix",
    );
  });
});
