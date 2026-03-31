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
    it("copies skills directory to .orchestrator/skills/", async () => {
      const service = new SeedingService();
      await service.copyDefaults(tempDir);

      const skillsDir = join(tempDir, ".orchestrator", "skills");
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

    it("copies agents directory to .orchestrator/agents/", async () => {
      const service = new SeedingService();
      await service.copyDefaults(tempDir);

      const agentsDir = join(tempDir, ".orchestrator", "agents");
      const entries = await readdir(agentsDir);
      expect(entries).toContain("researcher");
      expect(entries).toContain("implementer");
      expect(entries).toContain("cto");

      // Verify companion files copied
      const heartbeatContent = await readFile(
        join(agentsDir, "cto", "heartbeat.md"),
        "utf-8",
      );
      expect(heartbeatContent).toContain("Heartbeat");
    });
  });

  describe("parseAgentDefinitions", () => {
    it("parses all agent AGENTS.md files and returns structured data", async () => {
      const service = new SeedingService();
      await service.copyDefaults(tempDir);

      const agents = await service.parseAgentDefinitions(tempDir);

      expect(agents).toHaveLength(6);

      const researcher = agents.find((a) => a.name === "researcher");
      expect(researcher).toBeDefined();
      expect(researcher!.role).toBe("researcher");
      expect(researcher!.skills).toContain("research-methodology");

      const cto = agents.find((a) => a.name === "cto");
      expect(cto).toBeDefined();
      expect(cto!.heartbeat.enabled).toBe(true);
      expect(cto!.heartbeat.intervalSec).toBe(120);
    });

    it("resolves skill names to absolute paths", async () => {
      const service = new SeedingService();
      await service.copyDefaults(tempDir);

      const agents = await service.parseAgentDefinitions(tempDir);
      const implementer = agents.find((a) => a.name === "implementer");

      expect(implementer!.resolvedSkillPaths).toBeDefined();
      expect(implementer!.resolvedSkillPaths!.length).toBeGreaterThan(0);

      for (const p of implementer!.resolvedSkillPaths!) {
        expect(p).toContain(".orchestrator/skills/");
        expect(p).toMatch(/SKILL\.md$/);
      }
    });
  });

  describe("ensureGitignore", () => {
    it("creates .gitignore with .orchestrator/ if none exists", async () => {
      const service = new SeedingService();
      await service.ensureGitignore(tempDir);

      const content = await readFile(join(tempDir, ".gitignore"), "utf-8");
      expect(content).toContain(".orchestrator/");
    });

    it("appends .orchestrator/ if .gitignore exists without it", async () => {
      await writeFile(join(tempDir, ".gitignore"), "node_modules/\n.env\n");

      const service = new SeedingService();
      await service.ensureGitignore(tempDir);

      const content = await readFile(join(tempDir, ".gitignore"), "utf-8");
      expect(content).toContain("node_modules/");
      expect(content).toContain(".orchestrator/");
    });

    it("does not duplicate if .orchestrator/ already present", async () => {
      await writeFile(
        join(tempDir, ".gitignore"),
        "node_modules/\n.orchestrator/\n",
      );

      const service = new SeedingService();
      await service.ensureGitignore(tempDir);

      const content = await readFile(join(tempDir, ".gitignore"), "utf-8");
      const matches = content.match(/\.orchestrator\//g);
      expect(matches).toHaveLength(1);
    });
  });
});
