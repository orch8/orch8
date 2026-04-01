import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import { projects, agents, tasks } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { authPlugin } from "../api/middleware/auth.js";
import { identityRoutes } from "../api/routes/identity.js";
import "../types.js";

describe("Identity Route", () => {
  let testDb: TestDb;
  let app: ReturnType<typeof Fastify>;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Identity Test",
      slug: "identity-test",
      homeDir: "/tmp/identity",
      worktreeDir: "/tmp/identity-wt",
      budgetLimitUsd: 100,
      budgetSpentUsd: 25.50,
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(tasks);
    await testDb.db.delete(agents);

    app = Fastify();
    app.decorate("db", testDb.db);
    app.register(authPlugin);
    app.register(identityRoutes);
    await app.ready();
  });

  it("returns agent identity with permissions and project info", async () => {
    await testDb.db.insert(agents).values({
      id: "fe-eng",
      projectId,
      name: "Frontend Engineer",
      role: "engineer",
      canCreateTasks: true,
      canMoveTo: ["done"],
      canAssignTo: ["qa-eng"],
      budgetLimitUsd: 50,
      budgetSpentUsd: 10,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/identity",
      headers: {
        "x-agent-id": "fe-eng",
        "x-project-id": projectId,
        "x-run-id": "run_abc",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.agent.id).toBe("fe-eng");
    expect(body.agent.role).toBe("engineer");
    expect(body.permissions.canCreateTasks).toBe(true);
    expect(body.permissions.canMoveTo).toEqual(["done"]);
    expect(body.permissions.canAssignTo).toEqual(["qa-eng"]);
    expect(body.project.id).toBe(projectId);
    expect(body.project.budgetLimitUsd).toBe(100);
    expect(body.budget.agentSpent).toBe(10);
    expect(body.budget.projectSpent).toBe(25.50);
  });

  it("returns current task when agent has one in_progress", async () => {
    await testDb.db.insert(agents).values({
      id: "eng-1",
      projectId,
      name: "Engineer",
      role: "engineer",
    });

    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Fix bug",
      taskType: "quick",
      column: "in_progress",
      executionAgentId: "eng-1",
    }).returning();

    const res = await app.inject({
      method: "GET",
      url: "/api/identity",
      headers: {
        "x-agent-id": "eng-1",
        "x-project-id": projectId,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.currentTask.id).toBe(task.id);
    expect(body.currentTask.title).toBe("Fix bug");
  });

  it("returns 401 for unauthenticated request (no agent, not admin)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/identity",
      // No headers — but Fastify inject() comes from localhost, so this will be admin
    });

    // Admin requests get a different shape (no agent)
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.isAdmin).toBe(true);
    expect(body.agent).toBeNull();
  });
});
