import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { projects, agents, tasks, taskDependencies } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { authPlugin } from "../api/middleware/auth.js";
import { taskRoutes } from "../api/routes/tasks.js";
import { TaskService } from "../services/task.service.js";
import { TaskLifecycleService } from "../services/task-lifecycle.service.js";
import { hashAgentToken } from "../api/middleware/agent-token.js";
import "../types.js";

function tokenFor(agentId: string): string {
  return `${agentId}-token`;
}

function agentHeaders(agentId: string): Record<string, string> {
  return { authorization: `Bearer ${tokenFor(agentId)}` };
}

describe("Task Routes Permission Enforcement", () => {
  let testDb: TestDb;
  let projectId: string;
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Perm Integration",
      slug: "perm-integration",
      homeDir: "/tmp/perm-int",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(taskDependencies);
    await testDb.db.delete(tasks);
    await testDb.db.delete(agents);

    // Create agents with specific permissions
    await testDb.db.insert(agents).values([
      {
        id: "cto-agent",
        projectId,
        name: "CTO",
        role: "cto",
        canCreateTasks: true,
        canAssignTo: ["eng-agent"],
        canMoveTo: ["in_progress", "done"],
        agentTokenHash: hashAgentToken(tokenFor("cto-agent")),
      },
      {
        id: "eng-agent",
        projectId,
        name: "Engineer",
        role: "engineer",
        canCreateTasks: false,
        canAssignTo: [],
        canMoveTo: ["done"],
        agentTokenHash: hashAgentToken(tokenFor("eng-agent")),
      },
    ]);

    app = Fastify();
    app.decorate("db", testDb.db);

    const taskService = new TaskService(testDb.db);
    const lifecycleService = new TaskLifecycleService(testDb.db, taskService);
    app.decorate("lifecycleService", lifecycleService);
    app.decorate("heartbeatService", { enqueueWakeup: vi.fn().mockResolvedValue(undefined) });

    app.register(authPlugin, { allowLocalhostAdmin: true });
    app.register(taskRoutes);
    await app.ready();
  });

  describe("POST /api/tasks (create_task permission)", () => {
    it("allows CTO agent to create tasks", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: agentHeaders("cto-agent"),
        payload: {
          title: "New task",
          projectId,
          taskType: "quick",
        },
      });

      expect(response.statusCode).toBe(201);
      await app.close();
    });

    it("rejects engineer agent from creating tasks", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: agentHeaders("eng-agent"),
        payload: {
          title: "Unauthorized task",
          projectId,
          taskType: "quick",
        },
      });

      expect(response.statusCode).toBe(403);
      await app.close();
    });

    it("allows admin to create tasks regardless", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { "x-project-id": projectId },
        payload: {
          title: "Admin task",
          projectId,
          taskType: "quick",
        },
      });

      expect(response.statusCode).toBe(201);
      await app.close();
    });
  });

  describe("PATCH /api/tasks/:id (assign_task permission)", () => {
    it("allows CTO to reassign task", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Assign test",
        taskType: "quick",
      }).returning();

      const response = await app.inject({
        method: "PATCH",
        url: `/api/tasks/${task.id}`,
        headers: agentHeaders("cto-agent"),
        payload: { assignee: "eng-agent" },
      });

      expect(response.statusCode).toBe(200);
      await app.close();
    });

    it("rejects engineer from assigning to others", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Assign reject",
        taskType: "quick",
      }).returning();

      const response = await app.inject({
        method: "PATCH",
        url: `/api/tasks/${task.id}`,
        headers: agentHeaders("eng-agent"),
        payload: { assignee: "cto-agent" },
      });

      expect(response.statusCode).toBe(403);
      await app.close();
    });
  });

  describe("POST /api/tasks/:id/transition (move_task permission)", () => {
    it("rejects engineer moving to unpermitted column", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Move reject",
        taskType: "quick",
        column: "backlog",
      }).returning();

      const response = await app.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/transition`,
        headers: agentHeaders("eng-agent"),
        payload: { column: "in_progress" },
      });

      expect(response.statusCode).toBe(403);
      await app.close();
    });
  });
});
