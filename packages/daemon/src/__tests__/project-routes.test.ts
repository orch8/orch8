import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agents, heartbeatRuns, pipelines, projects } from "@orch/shared/db";
import { hashAgentToken } from "../api/middleware/agent-token.js";
import { withRepositoryWriter } from "../services/repository-checkout-gate.js";
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
    app.decorate("heartbeatService", { isRunActive: () => false, isProcessTracked: () => false } as never);

    app.register(authPlugin, { allowLocalhostAdmin: true });
    app.register(projectRoutes);
    await app.ready();
  });

  describe("GET /api/projects/:id/test-instructions", () => {
    it("previews a root test script without running it and refuses a symlink", async () => {
      const homeDir = await mkdtemp(join(tmpdir(), "orch8-test-instructions-"));
      const outside = await mkdtemp(join(tmpdir(), "orch8-test-instructions-outside-"));
      try {
        const [project] = await testDb.db.insert(projects).values({ name: "Instructions", slug: "instructions", homeDir }).returning();
        await writeFile(join(homeDir, "package.json"), JSON.stringify({ packageManager: "pnpm@9.15.0", scripts: { test: "node --test test.mjs" } }));
        const response = await app.inject({ method: "GET", url: `/api/projects/${project.id}/test-instructions` });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ repository: homeDir, script: "node --test test.mjs", packageManager: "pnpm@9.15.0" });
        await rm(join(homeDir, "package.json"));
        await writeFile(join(outside, "package.json"), JSON.stringify({ scripts: { test: "secret command" } }));
        await symlink(join(outside, "package.json"), join(homeDir, "package.json"));
        const linked = await app.inject({ method: "GET", url: `/api/projects/${project.id}/test-instructions` });
        expect(linked.statusCode).toBe(200);
        expect(linked.json().script).toBeNull();
        expect(linked.json().packageManager).toBeNull();
      } finally {
        await rm(homeDir, { recursive: true, force: true });
        await rm(outside, { recursive: true, force: true });
      }
    });
  });

  describe("POST /api/projects/:id/run-tests", () => {
    it("executes the root npm test only on explicit admin action and returns actual output", async () => {
      const homeDir = await mkdtemp(join(tmpdir(), "orch8-route-run-tests-"));
      try {
        const [project] = await testDb.db.insert(projects).values({ name: "Run", slug: "run", homeDir }).returning();
        await writeFile(join(homeDir, "package.json"), JSON.stringify({ scripts: { test: "node test.cjs" } }));
        await writeFile(join(homeDir, "test.cjs"), "console.log('actually executed'); process.exitCode = 7;");
        const res = await app.inject({ method: "POST", url: `/api/projects/${project.id}/run-tests`, payload: {} });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ command: ["npm", "run", "test", "--ignore-scripts"], exitCode: 7, timedOut: false });
        expect(res.json().stdout).toContain("actually executed");
        expect(res.json().script).toBe("node test.cjs");
      } finally { await rm(homeDir, { recursive: true, force: true }); }
    });
    it("rejects agent credentials and caller-supplied commands", async () => {
      const homeDir = await mkdtemp(join(tmpdir(), "orch8-route-run-tests-"));
      try {
        const [project] = await testDb.db.insert(projects).values({ name: "Run", slug: "run", homeDir }).returning();
        await testDb.db.insert(agents).values({ id: "fixture-agent", name: "Agent", projectId: project.id, role: "engineer", agentTokenHash: hashAgentToken("fixture-agent") });
        await writeFile(join(homeDir, "package.json"), JSON.stringify({ scripts: { test: "node -e \"console.log('safe')\"" } }));
        const url = `/api/projects/${project.id}/run-tests`;
        expect((await app.inject({ method: "POST", url, payload: {}, headers: { authorization: "Bearer fixture-agent" } })).statusCode).toBe(403);
        expect((await app.inject({ method: "POST", url, payload: { command: "touch /tmp/forbidden" } })).statusCode).toBe(400);
      } finally { await rm(homeDir, { recursive: true, force: true }); }
    });
    it("blocks active pipelines in aliases, queued runs, and checkout writers", async () => {
      const homeDir = await mkdtemp(join(tmpdir(), "orch8-route-run-tests-"));
      try {
        const [project, alias] = await testDb.db.insert(projects).values([
          { name: "Run", slug: "run", homeDir }, { name: "Alias", slug: "alias", homeDir },
        ]).returning();
        await writeFile(join(homeDir, "package.json"), JSON.stringify({ scripts: { test: "node -e \"console.log('should not execute')\"" } }));
        const url = `/api/projects/${project.id}/run-tests`;
        await testDb.db.insert(pipelines).values({ projectId: alias.id, name: "Active", status: "running" });
        expect((await app.inject({ method: "POST", url, payload: {} })).statusCode).toBe(409);
        await testDb.db.delete(pipelines);
        await testDb.db.insert(heartbeatRuns).values({ projectId: alias.id, agentId: "agent", invocationSource: "on_demand", status: "queued" });
        expect((await app.inject({ method: "POST", url, payload: {} })).statusCode).toBe(409);
        await testDb.db.delete(heartbeatRuns);
        let release!: () => void;
        let entered!: () => void;
        const held = new Promise<void>(resolve => { release = resolve; });
        const ready = new Promise<void>(resolve => { entered = resolve; });
        const writer = withRepositoryWriter(testDb.db, alias.id, async () => { entered(); await held; });
        await ready;
        try { expect((await app.inject({ method: "POST", url, payload: {} })).statusCode).toBe(409); }
        finally { release(); await writer; }
      } finally { await rm(homeDir, { recursive: true, force: true }); }
    });
  });

  describe("POST /api/projects/repository-clone", () => {
    it("rejects unsupported input before touching the filesystem", async () => {
      const res = await app.inject({ method: "POST", url: "/api/projects/repository-clone", payload: { url: "git@github.com:org/repo.git", parentDir: "/tmp" } });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/GitHub HTTPS URL/);
    });

    it("refuses an existing destination without replacing it", async () => {
      const parent = await mkdtemp(join(tmpdir(), "orch8-route-clone-"));
      try {
        await mkdir(join(parent, "orch8"));
        const res = await app.inject({ method: "POST", url: "/api/projects/repository-clone", payload: { url: "https://github.com/orch8/orch8.git", parentDir: parent } });
        expect(res.statusCode).toBe(409);
        expect(res.json().message).toMatch(/already exists/);
      } finally { await rm(parent, { recursive: true, force: true }); }
    });
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
