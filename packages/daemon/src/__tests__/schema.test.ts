import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { projects, agents, tasks, taskDependencies, comments, heartbeatRuns } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";

describe("Database Schema", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await setupTestDb();
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  it("creates a project", async () => {
    const [project] = await testDb.db.insert(projects).values({
      name: "Test Project",
      slug: "test-project",
      homeDir: "/tmp/test",
      worktreeDir: "/tmp/worktrees",
    }).returning();

    expect(project.id).toMatch(/^proj_/);
    expect(project.name).toBe("Test Project");
    expect(project.active).toBe(true);
  });

  it("creates an agent with composite PK", async () => {
    const [project] = await testDb.db.insert(projects).values({
      name: "Agent Project",
      slug: "agent-project",
      homeDir: "/tmp/ap",
      worktreeDir: "/tmp/ap-wt",
    }).returning();

    const [agent] = await testDb.db.insert(agents).values({
      id: "test-agent",
      projectId: project.id,
      name: "Test Agent",
      role: "engineer",
    }).returning();

    expect(agent.id).toBe("test-agent");
    expect(agent.role).toBe("engineer");
    expect(agent.maxTurns).toBe(25);
  });

  it("creates a quick task", async () => {
    const allProjects = await testDb.db.select().from(projects);
    const projectId = allProjects[0].id;

    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Fix bug",
      taskType: "quick",
    }).returning();

    expect(task.id).toMatch(/^task_/);
    expect(task.taskType).toBe("quick");
    expect(task.column).toBe("backlog");
  });

  it("creates a brainstorm task", async () => {
    const allProjects = await testDb.db.select().from(projects);
    const projectId = allProjects[0].id;

    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Explore architecture",
      taskType: "brainstorm",
      brainstormStatus: "active",
    }).returning();

    expect(task.taskType).toBe("brainstorm");
    expect(task.brainstormStatus).toBe("active");
  });

  it("enforces no self-dependency", async () => {
    const allTasks = await testDb.db.select().from(tasks);
    const taskId = allTasks[0].id;

    await expect(
      testDb.db.insert(taskDependencies).values({
        taskId,
        dependsOnId: taskId,
      })
    ).rejects.toThrow();
  });

  it("creates a heartbeat run with parent link", async () => {
    const allProjects = await testDb.db.select().from(projects);
    const projectId = allProjects[0].id;

    const [parentRun] = await testDb.db.insert(heartbeatRuns).values({
      agentId: "test-agent",
      projectId,
      invocationSource: "assignment",
    }).returning();

    const [childRun] = await testDb.db.insert(heartbeatRuns).values({
      agentId: "test-agent",
      projectId,
      invocationSource: "automation",
      parentRunId: parentRun.id,
    }).returning();

    expect(childRun.parentRunId).toBe(parentRun.id);
  });
});
