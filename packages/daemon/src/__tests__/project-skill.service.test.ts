import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { deriveTrustLevel, ProjectSkillService } from "../services/project-skill.service.js";
import { SeedingService } from "../services/seeding.service.js";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { projects, projectSkills } from "@orch/shared/db";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("deriveTrustLevel", () => {
  it("returns markdown_only for only .md files", () => {
    expect(deriveTrustLevel(["README.md", "SKILL.md"])).toBe("markdown_only");
  });

  it("returns scripts_executables for .sh files", () => {
    expect(deriveTrustLevel(["SKILL.md", "setup.sh"])).toBe("scripts_executables");
  });

  it("returns scripts_executables for .ts files", () => {
    expect(deriveTrustLevel(["SKILL.md", "helper.ts"])).toBe("scripts_executables");
  });

  it("returns scripts_executables for .js files", () => {
    expect(deriveTrustLevel(["index.js"])).toBe("scripts_executables");
  });

  it("returns scripts_executables for .py files", () => {
    expect(deriveTrustLevel(["run.py"])).toBe("scripts_executables");
  });

  it("returns scripts_executables for .rb files", () => {
    expect(deriveTrustLevel(["task.rb"])).toBe("scripts_executables");
  });

  it("returns assets for non-markdown non-script files", () => {
    expect(deriveTrustLevel(["SKILL.md", "diagram.png"])).toBe("assets");
  });

  it("returns scripts_executables when both scripts and assets exist", () => {
    expect(deriveTrustLevel(["SKILL.md", "run.sh", "logo.png"])).toBe("scripts_executables");
  });

  it("returns markdown_only for empty array", () => {
    expect(deriveTrustLevel([])).toBe("markdown_only");
  });
});

describe("ProjectSkillService", () => {
  let testDb: TestDb;
  let service: ProjectSkillService;
  let projectId: string;
  let projectHomeDir: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    // Clean tables
    await testDb.db.delete(projectSkills);
    await testDb.db.delete(projects);

    // Create temp dir for skill files
    projectHomeDir = await mkdtemp(join(tmpdir(), "orch-test-skills-"));
    const skillsDir = join(projectHomeDir, ".orch8", "skills");
    await mkdir(skillsDir, { recursive: true });

    // Insert a test project
    const [proj] = await testDb.db.insert(projects).values({
      name: "Test Project",
      slug: "test-project",
      homeDir: projectHomeDir,
      worktreeDir: join(projectHomeDir, "worktrees"),
    }).returning();
    projectId = proj.id;

    service = new ProjectSkillService(testDb.db);
  });

  afterEach(async () => {
    await rm(projectHomeDir, { recursive: true, force: true });
  });

  describe("create", () => {
    it("creates a skill from a local directory with SKILL.md", async () => {
      const skillDir = join(projectHomeDir, ".orch8", "skills", "my-skill");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), [
        "---",
        "name: My Skill",
        "description: A test skill",
        "---",
        "",
        "# My Skill",
        "",
        "Do the thing.",
      ].join("\n"));

      const skill = await service.create(projectId, {
        slug: "my-skill",
        sourceLocator: skillDir,
      });

      expect(skill.slug).toBe("my-skill");
      expect(skill.name).toBe("My Skill");
      expect(skill.description).toBe("A test skill");
      expect(skill.trustLevel).toBe("markdown_only");
      expect(skill.markdown).toContain("Do the thing.");
      expect(skill.sourceType).toBe("local_path");
    });

    it("derives scripts_executables trust level when .sh exists", async () => {
      const skillDir = join(projectHomeDir, ".orch8", "skills", "scripted");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), "---\nname: Scripted\n---\n# S\nContent");
      await writeFile(join(skillDir, "setup.sh"), "#!/bin/bash\necho hi");

      const skill = await service.create(projectId, {
        slug: "scripted",
        sourceLocator: skillDir,
      });

      expect(skill.trustLevel).toBe("scripts_executables");
    });
  });

  describe("list", () => {
    it("returns all skills and auto-prunes missing directories", async () => {
      // Insert two skills: one with a valid dir, one with a missing dir
      const validDir = join(projectHomeDir, ".orch8", "skills", "valid");
      await mkdir(validDir, { recursive: true });
      await writeFile(join(validDir, "SKILL.md"), "---\nname: Valid\n---\n# V\nContent");

      await service.create(projectId, { slug: "valid", sourceLocator: validDir });

      // Insert a stale skill pointing to a non-existent dir
      await testDb.db.insert(projectSkills).values({
        projectId,
        slug: "stale",
        name: "Stale",
        markdown: "gone",
        sourceLocator: "/nonexistent/path",
        trustLevel: "markdown_only",
      });

      const skills = await service.list(projectId);

      expect(skills).toHaveLength(1);
      expect(skills[0].slug).toBe("valid");
    });
  });

  describe("get", () => {
    it("retrieves a skill by slug", async () => {
      const skillDir = join(projectHomeDir, ".orch8", "skills", "lookup");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), "---\nname: Lookup\n---\n# L\nContent");

      const created = await service.create(projectId, { slug: "lookup", sourceLocator: skillDir });
      const fetched = await service.get(projectId, "lookup");

      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
    });

    it("retrieves a skill by id", async () => {
      const skillDir = join(projectHomeDir, ".orch8", "skills", "byid");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), "---\nname: ById\n---\n# B\nContent");

      const created = await service.create(projectId, { slug: "byid", sourceLocator: skillDir });
      const fetched = await service.get(projectId, created.id);

      expect(fetched).not.toBeNull();
      expect(fetched!.slug).toBe("byid");
    });

    it("returns null for unknown slug", async () => {
      const fetched = await service.get(projectId, "nope");
      expect(fetched).toBeNull();
    });
  });

  describe("delete", () => {
    it("removes the DB row and strips slug from agents desiredSkills", async () => {
      const skillDir = join(projectHomeDir, ".orch8", "skills", "doomed");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), "---\nname: Doomed\n---\n# D\nContent");

      await service.create(projectId, { slug: "doomed", sourceLocator: skillDir });

      // Insert an agent that references this skill
      const { agents: agentsTable } = await import("@orch/shared/db");
      await testDb.db.insert(agentsTable).values({
        id: "agent-1",
        projectId,
        name: "Test Agent",
        role: "engineer",
        status: "active",
        model: "opus",
        maxTurns: 10,
        maxConcurrentRuns: 1,
        heartbeatEnabled: false,
        heartbeatIntervalSec: 60,
        wakeOnAssignment: true,
        wakeOnOnDemand: true,
        wakeOnAutomation: false,
        budgetSpentUsd: 0,
        desiredSkills: ["doomed", "other-skill"],
      });

      await service.delete(projectId, "doomed");

      // Verify skill row is gone
      const skill = await service.get(projectId, "doomed");
      expect(skill).toBeNull();

      // Verify agent's desiredSkills no longer contains "doomed"
      const [agent] = await testDb.db
        .select()
        .from(agentsTable)
        .where(and(eq(agentsTable.id, "agent-1"), eq(agentsTable.projectId, projectId)));
      expect(agent.desiredSkills).toEqual(["other-skill"]);
    });
  });

  describe("syncFromDisk", () => {
    it("upserts skills from disk and prunes stale rows", async () => {
      // Create two skill directories on disk
      const skillsBase = join(projectHomeDir, ".orch8", "skills");
      const s1 = join(skillsBase, "alpha");
      const s2 = join(skillsBase, "beta");
      await mkdir(s1, { recursive: true });
      await mkdir(s2, { recursive: true });
      await writeFile(join(s1, "SKILL.md"), "---\nname: Alpha\ndescription: First\n---\n# Alpha\nA content");
      await writeFile(join(s2, "SKILL.md"), "---\nname: Beta\n---\n# Beta\nB content");

      // Insert a stale skill in DB
      await testDb.db.insert(projectSkills).values({
        projectId,
        slug: "removed",
        name: "Removed",
        markdown: "gone",
        sourceLocator: join(skillsBase, "removed"),
        trustLevel: "markdown_only",
      });

      await service.syncFromDisk(projectId, projectHomeDir);

      const skills = await service.list(projectId);
      const slugs = skills.map((s) => s.slug).sort();
      expect(slugs).toEqual(["alpha", "beta"]);

      // Stale "removed" should be pruned
      const stale = await service.get(projectId, "removed");
      expect(stale).toBeNull();
    });
  });
});

describe("SeedingService + ProjectSkillService integration", () => {
  let testDb: TestDb;
  let skillService: ProjectSkillService;
  let projectId: string;
  let projectHomeDir: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(projectSkills);
    await testDb.db.delete(projects);

    projectHomeDir = await mkdtemp(join(tmpdir(), "orch-seed-test-"));

    const [proj] = await testDb.db.insert(projects).values({
      name: "Seed Test",
      slug: "seed-test",
      homeDir: projectHomeDir,
      worktreeDir: join(projectHomeDir, "worktrees"),
    }).returning();
    projectId = proj.id;

    skillService = new ProjectSkillService(testDb.db);
  });

  afterEach(async () => {
    await rm(projectHomeDir, { recursive: true, force: true });
  });

  it("copyDefaults populates project skills from disk", async () => {
    const seedingService = new SeedingService();
    await seedingService.copyDefaults(projectHomeDir);
    await skillService.syncFromDisk(projectId, projectHomeDir);

    const skills = await skillService.list(projectId);
    // Should contain at least the orch8 skill from bundled defaults
    const slugs = skills.map((s) => s.slug);
    expect(slugs).toContain("orch8");
    expect(skills.length).toBeGreaterThan(0);
  });
});
