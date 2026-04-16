import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { and, eq } from "drizzle-orm";
import { projects, agents } from "@orch/shared/db";
import { SeedingService, CHAT_AGENT_DEFAULTS } from "../services/seeding.service.js";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "seed-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("SeedingService", () => {
  describe("copyDefaults", () => {
    it("does not copy skills to project directory", async () => {
      const service = new SeedingService();
      await service.copyDefaults(tempDir);

      const skillsDir = join(tempDir, ".orch8", "skills");
      // Skills directory should not be created (no skills copied)
      const { existsSync } = await import("node:fs");
      expect(existsSync(skillsDir)).toBe(false);
    });

    it("copies no agents when agentIds is omitted", async () => {
      const service = new SeedingService();
      await service.copyDefaults(tempDir);

      const agentsDir = join(tempDir, ".orch8", "agents");
      const entries = await readdir(agentsDir);
      expect(entries).toHaveLength(0);
    });

    it("copies only selected agents when agentIds is provided", async () => {
      const service = new SeedingService();
      await service.copyDefaults(tempDir, ["cto", "implementer"]);

      const agentsDir = join(tempDir, ".orch8", "agents");
      const entries = await readdir(agentsDir);
      expect(entries).toEqual(expect.arrayContaining(["cto", "implementer"]));
      expect(entries).toHaveLength(2);

      // Verify companion files copied
      const heartbeatContent = await readFile(
        join(agentsDir, "cto", "heartbeat.md"),
        "utf-8",
      );
      expect(heartbeatContent).toContain("Heartbeat");
    });

    it("ignores unknown agent IDs", async () => {
      const service = new SeedingService();
      await service.copyDefaults(tempDir, ["implementer", "nonexistent"]);

      const agentsDir = join(tempDir, ".orch8", "agents");
      const entries = await readdir(agentsDir);
      expect(entries).toEqual(["implementer"]);
    });

    it("strips YAML frontmatter from copied AGENTS.md", async () => {
      const service = new SeedingService();
      await service.copyDefaults(tempDir, ["cto"]);
      const copied = await readFile(
        join(tempDir, ".orch8", "agents", "cto", "AGENTS.md"),
        "utf-8",
      );
      expect(copied.startsWith("---")).toBe(false);
      expect(copied).toContain("# CTO");
    });
  });

  describe("parseAgentDefinitions", () => {
    const ALL_AGENTS = ["cto", "implementer", "planner", "qa", "researcher", "reviewer"];

    it("parses all agent AGENTS.md files and returns structured data", async () => {
      const service = new SeedingService();
      await service.copyDefaults(tempDir, ALL_AGENTS);

      const agents = await service.parseAgentDefinitions(tempDir);

      expect(agents).toHaveLength(6);

      const researcher = agents.find((a) => a.name === "researcher");
      expect(researcher).toBeDefined();
      expect(researcher!.role).toBe("researcher");
      expect(researcher!.skills).toContain("research-methodology");

      const cto = agents.find((a) => a.name === "cto");
      expect(cto).toBeDefined();
      expect(cto!.heartbeat.enabled).toBe(true);
      expect(cto!.heartbeat.intervalSec).toBe(3600);
    });

    it("returns skill slugs from parsed agent definitions", async () => {
      const service = new SeedingService();
      await service.copyDefaults(tempDir, ["implementer"]);

      const agents = await service.parseAgentDefinitions(tempDir);
      const implementer = agents.find((a) => a.name === "implementer");

      expect(implementer).toBeDefined();
      expect(implementer!.skills).toContain("tdd");
      expect(implementer!.skills).toContain("systematic-debugging");
    });
  });

  describe("listBundledAgents", () => {
    it("returns all 6 bundled agents", async () => {
      const service = new SeedingService();
      const agents = await service.listBundledAgents();

      expect(agents).toHaveLength(6);
      const ids = agents.map((a) => a.id).sort();
      expect(ids).toEqual(["cto", "implementer", "planner", "qa", "researcher", "reviewer"]);
    });

    it("resolves model shorthands to full IDs", async () => {
      const service = new SeedingService();
      const agents = await service.listBundledAgents();

      const cto = agents.find((a) => a.id === "cto")!;
      expect(cto.model).toBe("claude-opus-4-7");

      const implementer = agents.find((a) => a.id === "implementer")!;
      expect(implementer.model).toBe("claude-opus-4-7");
    });

    it("omits prompt template fields from bundled list", async () => {
      const service = new SeedingService();
      const list = await service.listBundledAgents();
      const implementer = list.find((a) => a.id === "implementer")!;
      expect((implementer as any).systemPrompt).toBeUndefined();
      expect((implementer as any).promptTemplate).toBeUndefined();
    });

    it("includes heartbeat config", async () => {
      const service = new SeedingService();
      const agents = await service.listBundledAgents();

      const cto = agents.find((a) => a.id === "cto")!;
      expect(cto.heartbeatEnabled).toBe(true);
      expect(cto.heartbeatIntervalSec).toBe(3600);

      const implementer = agents.find((a) => a.id === "implementer")!;
      expect(implementer.heartbeatEnabled).toBe(false);
      expect(implementer.heartbeatIntervalSec).toBeUndefined();
    });
  });

  describe("populateGlobalSkills", () => {
    it("copies bundled skills to target directory on a fresh install", async () => {
      const globalDir = join(tempDir, "global-skills");
      const service = new SeedingService();
      await service.populateGlobalSkills(globalDir);

      const entries = await readdir(globalDir);
      expect(entries).toContain("tdd");
      expect(entries).toContain("verification");
      expect(entries).toContain("orch8");
      expect(entries).toContain("systematic-debugging");

      // Verify content
      const tddContent = await readFile(join(globalDir, "tdd", "SKILL.md"), "utf-8");
      expect(tddContent).toContain("name: tdd");

      // Version marker was written.
      const marker = await readFile(join(globalDir, "tdd", ".orch8-version"), "utf-8");
      expect(marker).toMatch(/^v1:[0-9a-f]{64}$/);
    });

    it("is a no-op fast path when version marker matches bundled version", async () => {
      const globalDir = join(tempDir, "global-skills");
      const service = new SeedingService();

      // First call seeds + stamps.
      await service.populateGlobalSkills(globalDir);
      const marker1 = await readFile(join(globalDir, "tdd", ".orch8-version"), "utf-8");

      // Manually append a trailing line to the file so that, if we re-
      // copied, our change would be lost. Because the marker matches,
      // the re-copy should skip.
      const skillPath = join(globalDir, "tdd", "SKILL.md");
      const original = await readFile(skillPath, "utf-8");
      await writeFile(skillPath, original + "\n<!-- user edit -->\n");

      await service.populateGlobalSkills(globalDir);

      const after = await readFile(skillPath, "utf-8");
      expect(after).toContain("<!-- user edit -->");
      const marker2 = await readFile(join(globalDir, "tdd", ".orch8-version"), "utf-8");
      expect(marker2).toBe(marker1);
    });

    it("does not overwrite user customizations when version marker is missing", async () => {
      const globalDir = join(tempDir, "global-skills");
      const customSkillDir = join(globalDir, "tdd");
      await mkdir(customSkillDir, { recursive: true });
      const customPath = join(customSkillDir, "SKILL.md");
      await writeFile(customPath, "my custom edit — do not touch");

      const service = new SeedingService();
      const warnings: unknown[] = [];
      service.setLogger({
        warn: (...args: unknown[]) => warnings.push(args),
        info: () => {},
        error: () => {},
        debug: () => {},
        trace: () => {},
        fatal: () => {},
        child: () => service["logger"],
        level: "warn",
      } as unknown as Parameters<SeedingService["setLogger"]>[0]);

      await service.populateGlobalSkills(globalDir);

      // User's file was not clobbered.
      const after = await readFile(customPath, "utf-8");
      expect(after).toBe("my custom edit — do not touch");

      // And a warning was logged mentioning the skill name.
      const flattened = JSON.stringify(warnings);
      expect(flattened).toContain("tdd");
      expect(flattened.toLowerCase()).toContain("user customizations");
    });

    it("does not overwrite when bundled version differs from marker", async () => {
      const globalDir = join(tempDir, "global-skills");
      const customSkillDir = join(globalDir, "tdd");
      await mkdir(customSkillDir, { recursive: true });
      const customPath = join(customSkillDir, "SKILL.md");
      await writeFile(customPath, "my custom edit");
      // Stamp with a stale (wrong) version.
      await writeFile(join(customSkillDir, ".orch8-version"), "v1:stale");

      const service = new SeedingService();
      const warnings: unknown[] = [];
      service.setLogger({
        warn: (...args: unknown[]) => warnings.push(args),
        info: () => {},
        error: () => {},
        debug: () => {},
        trace: () => {},
        fatal: () => {},
        child: () => service["logger"],
        level: "warn",
      } as unknown as Parameters<SeedingService["setLogger"]>[0]);

      await service.populateGlobalSkills(globalDir);

      const after = await readFile(customPath, "utf-8");
      expect(after).toBe("my custom edit");
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe("provisionChatAgent", () => {
    let testDb: TestDb;
    let projectId: string;

    beforeAll(async () => {
      testDb = await setupTestDb();
    }, 60_000);

    afterAll(async () => {
      await teardownTestDb(testDb);
    });

    beforeEach(async () => {
      await testDb.db.delete(agents);
      await testDb.db.delete(projects);

      const [project] = await testDb.db.insert(projects).values({
        name: "Chat Perms Test",
        slug: `chat-perms-${Date.now()}`,
        homeDir: "/tmp/chat-perms",
        worktreeDir: "/tmp/chat-perms-wt",
      }).returning();
      projectId = project.id;
    });

    async function getChatRow() {
      const [row] = await testDb.db
        .select()
        .from(agents)
        .where(
          and(
            eq(agents.id, CHAT_AGENT_DEFAULTS.id),
            eq(agents.projectId, projectId),
          ),
        );
      return row;
    }

    it("creates a new chat agent with admin-level permissions", async () => {
      const service = new SeedingService();
      const created = await service.provisionChatAgent(testDb.db, projectId);
      expect(created).toBe(true);

      const row = await getChatRow();
      expect(row).toBeDefined();
      expect(row.canCreateTasks).toBe(true);
      expect(row.canAssignTo).toEqual(["*"]);
      expect(row.canMoveTo).toEqual(["backlog", "blocked", "in_progress", "done"]);
    });

    it("backfills permissions on an existing chat agent with empty permissions", async () => {
      // Simulate a pre-fix row: chat agent exists but has no permissions.
      await testDb.db.insert(agents).values({
        id: CHAT_AGENT_DEFAULTS.id,
        projectId,
        name: CHAT_AGENT_DEFAULTS.name,
        role: CHAT_AGENT_DEFAULTS.role,
        canCreateTasks: false,
        canAssignTo: [],
        canMoveTo: [],
      });

      const service = new SeedingService();
      const created = await service.provisionChatAgent(testDb.db, projectId);
      expect(created).toBe(false);

      const row = await getChatRow();
      expect(row.canCreateTasks).toBe(true);
      expect(row.canAssignTo).toEqual(["*"]);
      expect(row.canMoveTo).toEqual(["backlog", "blocked", "in_progress", "done"]);
    });

    it("preserves non-empty user-edited permissions on an existing chat agent", async () => {
      // User has narrowed permissions intentionally — backfill must not overwrite them.
      await testDb.db.insert(agents).values({
        id: CHAT_AGENT_DEFAULTS.id,
        projectId,
        name: CHAT_AGENT_DEFAULTS.name,
        role: CHAT_AGENT_DEFAULTS.role,
        canCreateTasks: true,
        canAssignTo: ["qa-bot"],
        canMoveTo: ["in_progress"],
      });

      const service = new SeedingService();
      await service.provisionChatAgent(testDb.db, projectId);

      const row = await getChatRow();
      expect(row.canCreateTasks).toBe(true);
      expect(row.canAssignTo).toEqual(["qa-bot"]);
      expect(row.canMoveTo).toEqual(["in_progress"]);
    });

    it("backfills missing desiredSkills without removing user-added ones", async () => {
      // Simulate a pre-existing agent with only some default skills + a custom one.
      await testDb.db.insert(agents).values({
        id: CHAT_AGENT_DEFAULTS.id,
        projectId,
        name: CHAT_AGENT_DEFAULTS.name,
        role: CHAT_AGENT_DEFAULTS.role,
        canCreateTasks: true,
        canAssignTo: ["*"],
        canMoveTo: ["backlog", "blocked", "in_progress", "done"],
        desiredSkills: ["_card-protocol", "brainstorm", "tasks", "user-custom-skill"],
      });

      const service = new SeedingService();
      await service.provisionChatAgent(testDb.db, projectId);

      const row = await getChatRow();
      // Should keep existing skills (including user-custom-skill)
      expect(row.desiredSkills).toContain("_card-protocol");
      expect(row.desiredSkills).toContain("brainstorm");
      expect(row.desiredSkills).toContain("tasks");
      expect(row.desiredSkills).toContain("user-custom-skill");
      // Should have added the missing defaults
      expect(row.desiredSkills).toContain("agents");
      expect(row.desiredSkills).toContain("pipelines");
      expect(row.desiredSkills).toContain("runs");
      expect(row.desiredSkills).toContain("cost-and-budget");
      expect(row.desiredSkills).toContain("memory");
      expect(row.desiredSkills).toContain("project-setup");
    });
  });

  describe("ensureGitignore", () => {
    it("creates .gitignore with .orch8/ if none exists", async () => {
      const service = new SeedingService();
      await service.ensureGitignore(tempDir);

      const content = await readFile(join(tempDir, ".gitignore"), "utf-8");
      expect(content).toContain(".orch8/");
    });

    it("appends .orch8/ if .gitignore exists without it", async () => {
      await writeFile(join(tempDir, ".gitignore"), "node_modules/\n.env\n");

      const service = new SeedingService();
      await service.ensureGitignore(tempDir);

      const content = await readFile(join(tempDir, ".gitignore"), "utf-8");
      expect(content).toContain("node_modules/");
      expect(content).toContain(".orch8/");
    });

    it("does not duplicate if .orch8/ already present", async () => {
      await writeFile(
        join(tempDir, ".gitignore"),
        "node_modules/\n.orch8/\n",
      );

      const service = new SeedingService();
      await service.ensureGitignore(tempDir);

      const content = await readFile(join(tempDir, ".gitignore"), "utf-8");
      const matches = content.match(/\.orch8\//g);
      expect(matches).toHaveLength(1);
    });
  });

  it("includes project-setup in CHAT_AGENT_DEFAULTS.desiredSkills", () => {
    expect(CHAT_AGENT_DEFAULTS.desiredSkills).toContain("project-setup");
  });
});
