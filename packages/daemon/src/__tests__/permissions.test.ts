import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import { projects, agents, tasks } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { authPlugin } from "../api/middleware/auth.js";
import { requirePermission } from "../api/middleware/permissions.js";
import "../types.js";

describe("Permission Middleware", () => {
  let testDb: TestDb;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Perms Test",
      slug: "perms-test",
      homeDir: "/tmp/perms",
      worktreeDir: "/tmp/perms-wt",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(tasks);
    await testDb.db.delete(agents);
  });

  function buildApp(permission: "create_task" | "move_task" | "assign_task") {
    const app = Fastify();
    app.decorate("db", testDb.db);
    app.register(authPlugin);
    app.post("/test", {
      preHandler: requirePermission(permission),
    }, async (request) => {
      return { ok: true };
    });
    return app;
  }

  describe("create_task", () => {
    it("allows admin requests", async () => {
      const app = buildApp("create_task");

      const response = await app.inject({
        method: "POST",
        url: "/test",
        headers: { "x-project-id": projectId },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      await app.close();
    });

    it("allows agent with canCreateTasks=true", async () => {
      await testDb.db.insert(agents).values({
        id: "creator",
        projectId,
        name: "Creator",
        role: "cto",
        canCreateTasks: true,
      });

      const app = buildApp("create_task");
      const response = await app.inject({
        method: "POST",
        url: "/test",
        headers: {
          "x-agent-id": "creator",
          "x-project-id": projectId,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      await app.close();
    });

    it("rejects agent with canCreateTasks=false", async () => {
      await testDb.db.insert(agents).values({
        id: "no-create",
        projectId,
        name: "No Create",
        role: "engineer",
        canCreateTasks: false,
      });

      const app = buildApp("create_task");
      const response = await app.inject({
        method: "POST",
        url: "/test",
        headers: {
          "x-agent-id": "no-create",
          "x-project-id": projectId,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("forbidden");
      await app.close();
    });
  });

  describe("move_task", () => {
    it("allows agent to move to permitted column", async () => {
      await testDb.db.insert(agents).values({
        id: "mover",
        projectId,
        name: "Mover",
        role: "engineer",
        canMoveTo: ["review"],
      });

      const app = buildApp("move_task");
      const response = await app.inject({
        method: "POST",
        url: "/test",
        headers: {
          "x-agent-id": "mover",
          "x-project-id": projectId,
        },
        payload: { column: "review" },
      });

      expect(response.statusCode).toBe(200);
      await app.close();
    });

    it("rejects agent moving to unpermitted column", async () => {
      await testDb.db.insert(agents).values({
        id: "limited-mover",
        projectId,
        name: "Limited",
        role: "engineer",
        canMoveTo: ["review"],
      });

      const app = buildApp("move_task");
      const response = await app.inject({
        method: "POST",
        url: "/test",
        headers: {
          "x-agent-id": "limited-mover",
          "x-project-id": projectId,
        },
        payload: { column: "done" },
      });

      expect(response.statusCode).toBe(403);
      await app.close();
    });
  });

  describe("assign_task", () => {
    it("allows agent to assign to permitted targets", async () => {
      await testDb.db.insert(agents).values({
        id: "assigner",
        projectId,
        name: "Assigner",
        role: "cto",
        canAssignTo: ["fe-eng", "be-eng"],
      });

      const app = buildApp("assign_task");
      const response = await app.inject({
        method: "POST",
        url: "/test",
        headers: {
          "x-agent-id": "assigner",
          "x-project-id": projectId,
        },
        payload: { assignee: "fe-eng" },
      });

      expect(response.statusCode).toBe(200);
      await app.close();
    });

    it("rejects agent assigning to unpermitted target", async () => {
      await testDb.db.insert(agents).values({
        id: "limited-assigner",
        projectId,
        name: "Limited",
        role: "engineer",
        canAssignTo: ["qa"],
      });

      const app = buildApp("assign_task");
      const response = await app.inject({
        method: "POST",
        url: "/test",
        headers: {
          "x-agent-id": "limited-assigner",
          "x-project-id": projectId,
        },
        payload: { assignee: "cto" },
      });

      expect(response.statusCode).toBe(403);
      await app.close();
    });
  });
});
