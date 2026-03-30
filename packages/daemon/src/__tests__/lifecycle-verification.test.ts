import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { projects, agents, tasks } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { TaskService } from "../services/task.service.js";
import { WorktreeService } from "../services/worktree.service.js";
import { TaskLifecycleService } from "../services/task-lifecycle.service.js";

describe("TaskLifecycleService — verification hook", () => {
  let testDb: TestDb;
  let lifecycleService: TaskLifecycleService;
  let projectId: string;
  let spawnedVerifications: Array<{ taskId: string }>;

  beforeAll(async () => {
    testDb = await setupTestDb();
    const taskService = new TaskService(testDb.db);
    const worktreeService = new WorktreeService();

    spawnedVerifications = [];
    lifecycleService = new TaskLifecycleService(
      testDb.db,
      taskService,
      worktreeService,
      {
        onReview: async (taskId: string, _projectId: string) => {
          spawnedVerifications.push({ taskId });
        },
      },
    );

    const [project] = await testDb.db.insert(projects).values({
      name: "Lifecycle Verif Test",
      slug: "lifecycle-verif",
      homeDir: "/tmp/lifecycle-verif",
      worktreeDir: "/tmp/lifecycle-verif-wt",
      verificationRequired: true,
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values({
      id: "eng-1", projectId, name: "Engineer", role: "engineer",
    });
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(tasks);
    spawnedVerifications = [];
  });

  it("calls onReview callback when task moves to review", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Lifecycle test",
      column: "in_progress",
      executionAgentId: "eng-1",
      executionRunId: "run_fake",
      executionLockedAt: new Date(),
    }).returning();

    await lifecycleService.transition(task.id, "review");

    expect(spawnedVerifications).toHaveLength(1);
    expect(spawnedVerifications[0].taskId).toBe(task.id);
  });

  it("does not call onReview when project has verificationRequired=false", async () => {
    // Create a separate project without verification
    const [noVerifProject] = await testDb.db.insert(projects).values({
      name: "No Verif",
      slug: "no-verif",
      homeDir: "/tmp/no-verif",
      worktreeDir: "/tmp/no-verif-wt",
      verificationRequired: false,
    }).returning();

    await testDb.db.insert(agents).values({
      id: "eng-1", projectId: noVerifProject.id, name: "Engineer", role: "engineer",
    });

    const [task] = await testDb.db.insert(tasks).values({
      projectId: noVerifProject.id,
      title: "No verif test",
      column: "in_progress",
      executionAgentId: "eng-1",
      executionRunId: "run_fake2",
      executionLockedAt: new Date(),
    }).returning();

    await lifecycleService.transition(task.id, "review");

    expect(spawnedVerifications).toHaveLength(0);
  });
});
