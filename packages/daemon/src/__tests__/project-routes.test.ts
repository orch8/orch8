import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import { projects } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { authPlugin } from "../api/middleware/auth.js";
import { projectRoutes } from "../api/routes/projects.js";
import { ProjectService } from "../services/project.service.js";
import "../types.js";

describe("Project Routes", () => {
  let testDb: TestDb;
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    testDb = await setupTestDb();
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(projects);

    app = Fastify();
    app.decorate("db", testDb.db);

    const projectService = new ProjectService(testDb.db);
    app.decorate("projectService", projectService);

    app.register(authPlugin);
    app.register(projectRoutes);
    await app.ready();
  });

  describe("POST /api/projects", () => {
    it("creates a project (admin)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: {
          name: "Test Project",
          slug: "test-project",
          homeDir: "/tmp/test",
          worktreeDir: "/tmp/test-wt",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.name).toBe("Test Project");
      expect(body.slug).toBe("test-project");
      expect(body.id).toMatch(/^proj_/);
    });

    it("returns 400 for missing required fields", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "No slug" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 409 for duplicate slug", async () => {
      const payload = {
        name: "P1", slug: "dup-slug",
        homeDir: "/tmp/p1", worktreeDir: "/tmp/p1-wt",
      };
      await app.inject({ method: "POST", url: "/api/projects", payload });

      const res = await app.inject({
        method: "POST", url: "/api/projects",
        payload: { ...payload, name: "P2" },
      });

      expect(res.statusCode).toBe(409);
    });
  });

  describe("GET /api/projects", () => {
    it("lists all projects (admin)", async () => {
      await testDb.db.insert(projects).values([
        { name: "A", slug: "a", homeDir: "/a", worktreeDir: "/a-wt" },
        { name: "B", slug: "b", homeDir: "/b", worktreeDir: "/b-wt" },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/api/projects",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(2);
    });
  });

  describe("GET /api/projects/:id", () => {
    it("returns a project by ID", async () => {
      const [proj] = await testDb.db.insert(projects).values({
        name: "Detail", slug: "detail",
        homeDir: "/d", worktreeDir: "/d-wt",
      }).returning();

      const res = await app.inject({
        method: "GET",
        url: `/api/projects/${proj.id}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().slug).toBe("detail");
    });

    it("returns 404 for nonexistent project", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/projects/proj_nonexistent",
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("PATCH /api/projects/:id", () => {
    it("updates a project", async () => {
      const [proj] = await testDb.db.insert(projects).values({
        name: "Old", slug: "upd",
        homeDir: "/u", worktreeDir: "/u-wt",
      }).returning();

      const res = await app.inject({
        method: "PATCH",
        url: `/api/projects/${proj.id}`,
        payload: { name: "New Name" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe("New Name");
    });
  });
});
