import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { projects, tasks, agents } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { TaskDispatcher } from "../services/task-dispatcher.service.js";

describe("TaskDispatcher", () => {
  let testDb: TestDb;
  let dispatcher: TaskDispatcher;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    dispatcher = new TaskDispatcher(testDb.db);

    const [project] = await testDb.db.insert(projects).values({
      name: "Dispatch Test",
      slug: "dispatch-test",
      homeDir: "/tmp/dispatch",
      worktreeDir: "/tmp/dispatch-wt",
      defaultModel: "claude-sonnet-4-6",
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values([
      { id: "engineer", projectId, name: "Engineer", role: "engineer" },
      { id: "researcher", projectId, name: "Researcher", role: "researcher" },
      { id: "planner", projectId, name: "Planner", role: "planner" },
      { id: "implementer", projectId, name: "Implementer", role: "implementer" },
      { id: "reviewer", projectId, name: "Reviewer", role: "reviewer" },
    ]);
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(tasks);
  });

  describe("plan (quick tasks)", () => {
    it("returns dispatch plan with assignee agent", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Fix bug",
        taskType: "quick",
        assignee: "engineer",
      }).returning();

      const plan = await dispatcher.plan(task);

      expect(plan.type).toBe("quick");
      expect(plan.agentId).toBe("engineer");
      expect(plan.needsWorktree).toBe(true);
    });

    it("returns null agentId when no assignee", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Unassigned",
        taskType: "quick",
      }).returning();

      const plan = await dispatcher.plan(task);

      expect(plan.type).toBe("quick");
      expect(plan.agentId).toBeNull();
    });
  });

  describe("plan (brainstorm tasks)", () => {
    it("returns brainstorm dispatch plan without worktree", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Explore ideas",
        taskType: "brainstorm",
        assignee: "engineer",
      }).returning();

      const plan = await dispatcher.plan(task);

      expect(plan.type).toBe("brainstorm");
      expect(plan.agentId).toBe("engineer");
      expect(plan.needsWorktree).toBe(false);
    });
  });
});
