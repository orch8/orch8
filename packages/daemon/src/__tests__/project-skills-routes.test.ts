import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { projects, projectSkills } from "@orch/shared/db";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Fastify from "fastify";
import { projectSkillRoutes } from "../api/routes/project-skills.js";
import { ProjectSkillService } from "../services/project-skill.service.js";

describe("project-skills routes", () => {
  let testDb: TestDb;
  let projectId: string;
  let projectHomeDir: string;
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    testDb = await setupTestDb();
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(projectSkills);
    await testDb.db.delete(projects);

    projectHomeDir = await mkdtemp(join(tmpdir(), "orch-route-test-"));
    const skillsDir = join(projectHomeDir, ".orchestrator", "skills");
    await mkdir(skillsDir, { recursive: true });

    const [proj] = await testDb.db.insert(projects).values({
      name: "Test",
      slug: "test",
      homeDir: projectHomeDir,
      worktreeDir: join(projectHomeDir, "worktrees"),
    }).returning();
    projectId = proj.id;

    app = Fastify();
    const skillService = new ProjectSkillService(testDb.db);
    app.decorate("db", testDb.db);
    app.decorate("projectSkillService", skillService);
    app.register(projectSkillRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(projectHomeDir, { recursive: true, force: true });
  });

  it("GET /api/projects/:projectId/skills returns empty list", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/skills`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("POST /api/projects/:projectId/skills creates a skill", async () => {
    const skillDir = join(projectHomeDir, ".orchestrator", "skills", "test-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "---\nname: Test Skill\ndescription: A test\n---\n# Test\nContent");

    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/skills`,
      payload: { slug: "test-skill", sourceLocator: skillDir },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.slug).toBe("test-skill");
    expect(body.name).toBe("Test Skill");
  });

  it("GET /api/projects/:projectId/skills/:slug returns a skill", async () => {
    const skillDir = join(projectHomeDir, ".orchestrator", "skills", "fetch-me");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "---\nname: Fetch Me\n---\n# F\nBody");

    await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/skills`,
      payload: { slug: "fetch-me", sourceLocator: skillDir },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/skills/fetch-me`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Fetch Me");
  });

  it("DELETE /api/projects/:projectId/skills/:slug removes the skill", async () => {
    const skillDir = join(projectHomeDir, ".orchestrator", "skills", "doomed");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "---\nname: Doomed\n---\n# D\nBody");

    await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/skills`,
      payload: { slug: "doomed", sourceLocator: skillDir },
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/projects/${projectId}/skills/doomed`,
    });

    expect(res.statusCode).toBe(204);

    const getRes = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/skills/doomed`,
    });
    expect(getRes.statusCode).toBe(404);
  });

  it("POST /api/projects/:projectId/skills/sync triggers disk sync", async () => {
    const skillDir = join(projectHomeDir, ".orchestrator", "skills", "synced");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "---\nname: Synced\n---\n# S\nBody");

    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/skills/sync`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.synced).toBe(1);
  });
});
