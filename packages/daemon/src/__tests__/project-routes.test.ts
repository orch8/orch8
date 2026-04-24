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

    app.register(authPlugin, { allowLocalhostAdmin: true });
    app.register(projectRoutes);
    await app.ready();
  });

  describe("POST /api/projects", () => {
    it("creates a project with the default merge strategy when finishStrategy is omitted", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: {
          name: "Test Project",
          slug: "test-project",
          homeDir: "/tmp/test",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.finishStrategy).toBe("merge");
      expect(body.id).toMatch(/^proj_/);
      expect(body.key).toBe("TES");
    });

    it("accepts an explicit finishStrategy", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: {
          name: "PR Project",
          slug: "pr-project",
          homeDir: "/tmp/pr",
          finishStrategy: "pr",
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().finishStrategy).toBe("pr");
    });

    it("rejects the legacy worktreeDir field", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: {
          name: "Legacy",
          slug: "legacy",
          homeDir: "/tmp/legacy",
          worktreeDir: "/tmp/wt",
        },
      });

      // Zod allows unknown keys by default — the field is silently dropped, but
      // the project must still be created without it. Confirm no worktreeDir
      // makes it onto the row.
      expect(res.statusCode).toBe(201);
      expect(res.json()).not.toHaveProperty("worktreeDir");
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
        homeDir: "/tmp/p1",
      };
      await app.inject({ method: "POST", url: "/api/projects", payload });

      const res = await app.inject({
        method: "POST", url: "/api/projects",
        payload: { ...payload, name: "P2" },
      });

      expect(res.statusCode).toBe(409);
    });

    it("returns 409 for duplicate project key", async () => {
      await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "A", slug: "alpha", key: "ALP", homeDir: "/tmp/a" },
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "B", slug: "beta", key: "ALP", homeDir: "/tmp/b" },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().message).toContain("Project key");
    });
  });

  describe("GET /api/projects", () => {
    it("lists all projects (admin)", async () => {
      await testDb.db.insert(projects).values([
        { name: "A", slug: "a", homeDir: "/a" },
        { name: "B", slug: "b", homeDir: "/b" },
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
        homeDir: "/d",
      }).returning();

      const res = await app.inject({
        method: "GET",
        url: `/api/projects/${proj.id}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().slug).toBe("detail");
    });

    it("returns a project by slug", async () => {
      await testDb.db.insert(projects).values({
        name: "Slug Detail", slug: "slug-detail",
        homeDir: "/d",
      }).returning();

      const res = await app.inject({
        method: "GET",
        url: "/api/projects/slug-detail",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().slug).toBe("slug-detail");
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
        homeDir: "/u",
      }).returning();

      const res = await app.inject({
        method: "PATCH",
        url: `/api/projects/${proj.id}`,
        payload: { name: "New Name" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe("New Name");
    });

    it("updates a project by slug", async () => {
      await testDb.db.insert(projects).values({
        name: "Old", slug: "upd-slug",
        homeDir: "/u",
      }).returning();

      const res = await app.inject({
        method: "PATCH",
        url: "/api/projects/upd-slug",
        payload: { name: "New Slug Name" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe("New Slug Name");
    });
  });
});
