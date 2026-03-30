import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import { projects, tasks, agents, taskDependencies } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { authPlugin } from "../api/middleware/auth.js";
import { taskRoutes } from "../api/routes/tasks.js";
import { TaskService } from "../services/task.service.js";
import { WorktreeService } from "../services/worktree.service.js";
import { TaskLifecycleService } from "../services/task-lifecycle.service.js";
import "../types.js";

describe("Task API Routes", () => {
  let testDb: TestDb;
  let projectId: string;
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Route Test",
      slug: "route-test",
      homeDir: "/tmp/routes",
      worktreeDir: "/tmp/routes-wt",
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values({
      id: "agent-1",
      projectId,
      name: "Agent One",
      role: "engineer",
    });
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(taskDependencies);
    await testDb.db.delete(tasks);

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

  describe("POST /api/tasks", () => {
    it("creates a quick task", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { "x-project-id": projectId },
        payload: {
          title: "Fix bug",
          projectId,
          taskType: "quick",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.id).toMatch(/^task_/);
      expect(body.taskType).toBe("quick");
      expect(body.column).toBe("backlog");
    });

    it("creates a complex task with research phase", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { "x-project-id": projectId },
        payload: {
          title: "New auth",
          projectId,
          taskType: "complex",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.taskType).toBe("complex");
      expect(body.complexPhase).toBe("research");
    });

    it("creates a brainstorm task", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { "x-project-id": projectId },
        payload: {
          title: "Explore options",
          projectId,
          taskType: "brainstorm",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.taskType).toBe("brainstorm");
      expect(body.brainstormStatus).toBe("active");
    });

    it("rejects invalid payload", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { "x-project-id": projectId },
        payload: { taskType: "quick" },  // missing title
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /api/tasks", () => {
    it("lists tasks for a project", async () => {
      await testDb.db.insert(tasks).values([
        { projectId, title: "A", taskType: "quick" },
        { projectId, title: "B", taskType: "complex", complexPhase: "research" },
      ]);

      const response = await app.inject({
        method: "GET",
        url: `/api/tasks?projectId=${projectId}`,
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(2);
    });

    it("filters by task type", async () => {
      await testDb.db.insert(tasks).values([
        { projectId, title: "Quick", taskType: "quick" },
        { projectId, title: "Complex", taskType: "complex", complexPhase: "research" },
      ]);

      const response = await app.inject({
        method: "GET",
        url: `/api/tasks?projectId=${projectId}&taskType=complex`,
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(1);
      expect(body[0].taskType).toBe("complex");
    });
  });

  describe("GET /api/tasks/:id", () => {
    it("returns a task by id", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Get me",
        taskType: "quick",
      }).returning();

      const response = await app.inject({
        method: "GET",
        url: `/api/tasks/${task.id}`,
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.title).toBe("Get me");
    });

    it("returns 404 for nonexistent task", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/tasks/task_nonexistent",
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("PATCH /api/tasks/:id", () => {
    it("updates task fields", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Old",
        taskType: "quick",
      }).returning();

      const response = await app.inject({
        method: "PATCH",
        url: `/api/tasks/${task.id}`,
        headers: { "x-project-id": projectId },
        payload: { title: "New", priority: "high" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.title).toBe("New");
      expect(body.priority).toBe("high");
    });
  });

  describe("POST /api/tasks/:id/complete", () => {
    it("signals quick task completion by moving to review", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Complete me",
        taskType: "quick",
        column: "in_progress",
      }).returning();

      const response = await app.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/complete`,
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.column).toBe("review");
    });

    it("signals complex task phase completion", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Phase complete",
        taskType: "complex",
        complexPhase: "research",
        column: "in_progress",
      }).returning();

      const response = await app.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/complete`,
        headers: { "x-project-id": projectId },
        payload: { output: "Research findings..." },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.task.complexPhase).toBe("plan");
      expect(body.nextPhase).toBe("plan");
    });
  });

  describe("POST /api/tasks/:id/dependencies", () => {
    it("adds a dependency", async () => {
      const [a] = await testDb.db.insert(tasks).values({
        projectId, title: "A", taskType: "quick",
      }).returning();
      const [b] = await testDb.db.insert(tasks).values({
        projectId, title: "B", taskType: "quick",
      }).returning();

      const response = await app.inject({
        method: "POST",
        url: `/api/tasks/${b.id}/dependencies`,
        headers: { "x-project-id": projectId },
        payload: { dependsOnId: a.id },
      });

      expect(response.statusCode).toBe(201);
    });
  });

  describe("POST /api/tasks/:id/convert", () => {
    it("converts brainstorm to quick task", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Brainstorm",
        taskType: "brainstorm",
        brainstormStatus: "ready",
      }).returning();

      const response = await app.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/convert`,
        headers: { "x-project-id": projectId },
        payload: { taskType: "quick" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.taskType).toBe("quick");
    });
  });
});
