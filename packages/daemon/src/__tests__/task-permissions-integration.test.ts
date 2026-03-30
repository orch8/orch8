import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import { projects, agents, tasks, taskDependencies } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { authPlugin } from "../api/middleware/auth.js";
import { taskRoutes } from "../api/routes/tasks.js";
import { TaskService } from "../services/task.service.js";
import { WorktreeService } from "../services/worktree.service.js";
import { TaskLifecycleService } from "../services/task-lifecycle.service.js";
import "../types.js";

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
      worktreeDir: "/tmp/perm-int-wt",
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
        canMoveTo: ["in_progress", "review", "verification", "done"],
      },
      {
        id: "eng-agent",
        projectId,
        name: "Engineer",
        role: "engineer",
        canCreateTasks: false,
        canAssignTo: [],
        canMoveTo: ["review"],
      },
    ]);

    app = Fastify();
    app.decorate("db", testDb.db);

    const taskService = new TaskService(testDb.db);
    const worktreeService = new WorktreeService();
    const lifecycleService = new TaskLifecycleService(testDb.db, taskService, worktreeService);
    app.decorate("lifecycleService", lifecycleService);

    app.register(authPlugin);
    app.register(taskRoutes);
    await app.ready();
  });

  describe("POST /api/tasks (create_task permission)", () => {
    it("allows CTO agent to create tasks", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: {
          "x-agent-id": "cto-agent",
          "x-project-id": projectId,
        },
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
        headers: {
          "x-agent-id": "eng-agent",
          "x-project-id": projectId,
        },
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
        headers: {
          "x-agent-id": "cto-agent",
          "x-project-id": projectId,
        },
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
        headers: {
          "x-agent-id": "eng-agent",
          "x-project-id": projectId,
        },
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
        column: "review",
      }).returning();

      const response = await app.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/transition`,
        headers: {
          "x-agent-id": "eng-agent",
          "x-project-id": projectId,
        },
        payload: { column: "done" },
      });

      expect(response.statusCode).toBe(403);
      await app.close();
    });
  });
});
