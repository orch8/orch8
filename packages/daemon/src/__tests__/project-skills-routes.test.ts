import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { decorateTestApp } from "./helpers/test-app.js";
import { agents, projects, projectSkills } from "@orch/shared/db";
import { eq } from "drizzle-orm";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
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
    const skillsDir = join(projectHomeDir, ".orch8", "skills");
    await mkdir(skillsDir, { recursive: true });

    const [proj] = await testDb.db.insert(projects).values({
      name: "Test",
      slug: "test",
      homeDir: projectHomeDir,
    }).returning();
    projectId = proj.id;

    app = Fastify();
    const skillService = new ProjectSkillService(testDb.db);
    decorateTestApp(app, testDb.db);
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
    const skillDir = join(projectHomeDir, ".orch8", "skills", "test-skill");
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

  it("POST /api/projects/:projectId/skills creates a project-local skill and assigns it to agents", async () => {
    await testDb.db.insert(agents).values({
      id: "agent-1",
      projectId,
      name: "Agent One",
      role: "engineer",
      status: "active",
      model: "opus",
      desiredSkills: [],
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/skills`,
      payload: {
        name: "Review Helper",
        description: "Review pull requests",
        markdown: "# Procedure\n\nRead the diff.",
        assignedAgentIds: ["agent-1"],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.slug).toBe("review-helper");
    expect(body.sourceType).toBe("local_path");
    expect(body.markdown).toContain("Read the diff.");

    const skillFile = join(projectHomeDir, ".orch8", "skills", "review-helper", "SKILL.md");
    const content = await readFile(skillFile, "utf-8");
    expect(content).toContain('name: "Review Helper"');

    const [agent] = await testDb.db
      .select()
      .from(agents)
      .where(eq(agents.id, "agent-1"));
    expect(agent.desiredSkills).toContain("review-helper");
  });

  it("GET /api/projects/:projectId/skills/:slug returns a skill", async () => {
    const skillDir = join(projectHomeDir, ".orch8", "skills", "fetch-me");
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
    const skillDir = join(projectHomeDir, ".orch8", "skills", "doomed");
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

  it("DELETE returns 403 for global skills", async () => {
    // Insert a global skill directly
    await testDb.db.insert(projectSkills).values({
      projectId,
      slug: "global-tdd",
      name: "TDD",
      markdown: "content",
      sourceType: "global",
      sourceLocator: "/global/tdd",
      trustLevel: "markdown_only",
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/projects/${projectId}/skills/global-tdd`,
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain("global");
  });

  it("PATCH /api/projects/:projectId/skills/:slug edits a global skill as a local override", async () => {
    await testDb.db.insert(projectSkills).values({
      projectId,
      slug: "global-tdd",
      name: "TDD",
      markdown: "---\nname: TDD\n---\n# Old",
      sourceType: "global",
      sourceLocator: "/global/tdd",
      trustLevel: "markdown_only",
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/projects/${projectId}/skills/global-tdd`,
      payload: {
        name: "TDD Local",
        description: "Project version",
        markdown: "# New\nLocal procedure",
        assignedAgentIds: [],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sourceType).toBe("local_path");
    expect(body.sourceLocator).toContain(join(".orch8", "skills", "global-tdd"));
    expect(body.markdown).toContain("Local procedure");
  });

  it("POST /api/projects/:projectId/skills/sync triggers disk sync", async () => {
    const skillDir = join(projectHomeDir, ".orch8", "skills", "synced");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "---\nname: Synced\n---\n# S\nBody");

    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/skills/sync`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Synced count includes global skills + the local "synced" skill
    expect(body.synced).toBeGreaterThanOrEqual(1);
  });
});
