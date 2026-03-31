import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import { projects, agents } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { authPlugin } from "../api/middleware/auth.js";
import { projectRoutes } from "../api/routes/projects.js";
import { ProjectService } from "../services/project.service.js";
import { AgentService } from "../services/agent.service.js";
import "../types.js";

describe("Project Archive", () => {
  let testDb: TestDb;
  let projectService: ProjectService;
  let agentService: AgentService;

  beforeAll(async () => {
    testDb = await setupTestDb();
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(agents);
    await testDb.db.delete(projects);
    projectService = new ProjectService(testDb.db);
    agentService = new AgentService(testDb.db);
  });

  describe("ProjectService.archive", () => {
    it("sets project active to false", async () => {
      const project = await projectService.create({
        name: "Archivable",
        slug: "archivable",
        homeDir: "/tmp/arch",
        worktreeDir: "/tmp/arch-wt",
      });

      const archived = await projectService.archive(project.id);
      expect(archived.active).toBe(false);
    });

    it("pauses all active agents in the project", async () => {
      const project = await projectService.create({
        name: "WithAgents",
        slug: "with-agents",
        homeDir: "/tmp/wa",
        worktreeDir: "/tmp/wa-wt",
      });

      await agentService.create({
        id: "eng-1",
        projectId: project.id,
        name: "Engineer",
        role: "engineer",
      });

      await projectService.archive(project.id);

      const agentAfter = await agentService.getById("eng-1", project.id);
      expect(agentAfter!.status).toBe("paused");
      expect(agentAfter!.pauseReason).toBe("project archived");
    });

    it("does not modify terminated agents", async () => {
      const project = await projectService.create({
        name: "Mixed",
        slug: "mixed",
        homeDir: "/tmp/mix",
        worktreeDir: "/tmp/mix-wt",
      });

      await agentService.create({
        id: "eng-active",
        projectId: project.id,
        name: "Active",
        role: "engineer",
      });

      // Manually set an agent to terminated
      const { eq: eqOp } = await import("drizzle-orm");
      const { agents: agentsTable } = await import("@orch/shared/db");
      await testDb.db
        .update(agentsTable)
        .set({ status: "terminated" })
        .where(eqOp(agentsTable.id, "eng-active"));

      await agentService.create({
        id: "eng-active2",
        projectId: project.id,
        name: "Active2",
        role: "engineer",
      });

      await projectService.archive(project.id);

      const terminated = await agentService.getById("eng-active", project.id);
      expect(terminated!.status).toBe("terminated");

      const paused = await agentService.getById("eng-active2", project.id);
      expect(paused!.status).toBe("paused");
    });

    it("throws if project not found", async () => {
      await expect(projectService.archive("proj_nonexistent")).rejects.toThrow(
        "Project not found",
      );
    });
  });

  describe("POST /api/projects/:id/archive", () => {
    let app: ReturnType<typeof Fastify>;

    beforeEach(async () => {
      await testDb.db.delete(agents);
      await testDb.db.delete(projects);

      app = Fastify();
      app.decorate("db", testDb.db);
      const ps = new ProjectService(testDb.db);
      app.decorate("projectService", ps);
      app.register(authPlugin);
      app.register(projectRoutes);
      await app.ready();
    });

    it("archives a project (admin)", async () => {
      const [proj] = await testDb.db
        .insert(projects)
        .values({
          name: "ToArchive",
          slug: "to-archive",
          homeDir: "/tmp/ta",
          worktreeDir: "/tmp/ta-wt",
        })
        .returning();

      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${proj.id}/archive`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().active).toBe(false);
    });

    it("returns 404 for nonexistent project", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/proj_fake/archive",
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 403 for non-admin", async () => {
      const [proj] = await testDb.db
        .insert(projects)
        .values({
          name: "NoAdmin",
          slug: "no-admin",
          homeDir: "/tmp/na",
          worktreeDir: "/tmp/na-wt",
        })
        .returning();

      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${proj.id}/archive`,
        headers: { "x-agent-id": "some-agent", "x-project-id": proj.id },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
