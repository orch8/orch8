import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import { projects, tasks, comments, agents } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { authPlugin } from "../api/middleware/auth.js";
import { commentRoutes } from "../api/routes/comments.js";
import { ProjectService } from "../services/project.service.js";
import "../types.js";

describe("Comment API Routes", () => {
  let testDb: TestDb;
  let projectId: string;
  let taskId: string;
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Comment Route Test",
      slug: "comment-route-test",
      homeDir: "/tmp/cr",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(comments);
    await testDb.db.delete(tasks);
    await testDb.db.delete(agents);

    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Route task",
      taskType: "quick",
    }).returning();
    taskId = task.id;

    app = Fastify();
    app.decorate("db", testDb.db);
    app.decorate("projectService", new ProjectService(testDb.db));
    app.register(authPlugin, { allowLocalhostAdmin: true });
    app.register(commentRoutes);
    await app.ready();
  });

  describe("POST /api/tasks/:taskId/comments", () => {
    it("creates a comment", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/api/tasks/${taskId}/comments`,
        headers: { "x-project-id": projectId },
        payload: {
          author: "agent-1",
          body: "Looks good",
          type: "inline",
          lineRef: "src/main.ts:10",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.id).toMatch(/^cmt_/);
      expect(body.taskId).toBe(taskId);
      expect(body.body).toBe("Looks good");
      expect(body.mentions).toEqual([]);
    });

    it("resolves mentions against agents in the task project", async () => {
      await testDb.db.insert(agents).values([
        { id: "alice", projectId, name: "Alice", role: "engineer" },
        { id: "bob", projectId, name: "Bob", role: "engineer" },
      ]);

      const response = await app.inject({
        method: "POST",
        url: `/api/tasks/${taskId}/comments`,
        headers: { "x-project-id": projectId },
        payload: {
          author: "user",
          body: "@alice and @bob, please look. @alice again, @unknown nope.",
          notify: false,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.mentions).toEqual(["alice", "bob"]);
    });

    it("rejects missing body", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/api/tasks/${taskId}/comments`,
        headers: { "x-project-id": projectId },
        payload: { author: "agent-1" },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /api/tasks/:taskId/comments", () => {
    it("lists comments for a task", async () => {
      await testDb.db.insert(comments).values([
        { taskId, author: "a", body: "First" },
        { taskId, author: "b", body: "Second" },
      ]);

      const response = await app.inject({
        method: "GET",
        url: `/api/tasks/${taskId}/comments`,
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(2);
    });

    it("filters by type", async () => {
      await testDb.db.insert(comments).values([
        { taskId, author: "a", body: "Inline", type: "inline" },
        { taskId, author: "b", body: "System", type: "system" },
      ]);

      const response = await app.inject({
        method: "GET",
        url: `/api/tasks/${taskId}/comments?type=system`,
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(1);
      expect(body[0].type).toBe("system");
    });
  });

  describe("DELETE /api/comments/:id", () => {
    it("deletes a comment", async () => {
      const [comment] = await testDb.db.insert(comments).values({
        taskId,
        author: "a",
        body: "Delete me",
      }).returning();

      const response = await app.inject({
        method: "DELETE",
        url: `/api/comments/${comment.id}`,
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ ok: true });
    });

    it("returns 404 for nonexistent comment", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/api/comments/cmt_nonexistent",
        headers: { "x-project-id": projectId },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
