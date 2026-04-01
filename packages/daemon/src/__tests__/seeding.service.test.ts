import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SeedingService } from "../services/seeding.service.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "seed-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("SeedingService", () => {
  describe("copyDefaults", () => {
    it("copies skills directory to .orch8/skills/", async () => {
      const service = new SeedingService();
      await service.copyDefaults(tempDir);

      const skillsDir = join(tempDir, ".orch8", "skills");
      const entries = await readdir(skillsDir);
      expect(entries).toContain("tdd");
      expect(entries).toContain("verification");
      expect(entries).toContain("systematic-debugging");

      // Verify content was actually copied
      const tddContent = await readFile(
        join(skillsDir, "tdd", "SKILL.md"),
        "utf-8",
      );
      expect(tddContent).toContain("name: tdd");
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

    it("resolves skill names to absolute paths", async () => {
      const service = new SeedingService();
      await service.copyDefaults(tempDir, ["implementer"]);

      const agents = await service.parseAgentDefinitions(tempDir);
      const implementer = agents.find((a) => a.name === "implementer");

      expect(implementer!.resolvedSkillPaths).toBeDefined();
      expect(implementer!.resolvedSkillPaths!.length).toBeGreaterThan(0);

      for (const p of implementer!.resolvedSkillPaths!) {
        expect(p).toContain(".orch8/skills/");
        expect(p).toMatch(/SKILL\.md$/);
      }
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
      expect(cto.model).toBe("claude-opus-4-6");

      const implementer = agents.find((a) => a.id === "implementer")!;
      expect(implementer.model).toBe("claude-sonnet-4-6");
    });

    it("includes parsed prompt sections", async () => {
      const service = new SeedingService();
      const agents = await service.listBundledAgents();

      const implementer = agents.find((a) => a.id === "implementer")!;
      expect(implementer.systemPrompt).toContain("implementer agent");
      expect(implementer.promptTemplate).toBeDefined();
      expect(implementer.bootstrapPromptTemplate).toBeDefined();
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
});
