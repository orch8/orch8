import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { SeedingService } from "../services/seeding.service.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "proj-seed-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("Project seeding integration", () => {
  it("seeds a project directory with defaults and parses agents", async () => {
    const service = new SeedingService();

    // Step 1: Copy defaults
    await service.copyDefaults(tempDir);

    // Step 2: Parse agent definitions
    const agents = await service.parseAgentDefinitions(tempDir);

    // Should have all 6 default agents
    expect(agents).toHaveLength(6);

    const names = agents.map((a) => a.name).sort();
    expect(names).toEqual([
      "cto",
      "implementer",
      "planner",
      "qa",
      "researcher",
      "reviewer",
    ]);

    // Each agent should have resolved skill paths
    for (const agent of agents) {
      if (agent.skills.length > 0) {
        expect(agent.resolvedSkillPaths).toBeDefined();
        expect(agent.resolvedSkillPaths!.length).toBe(agent.skills.length);

        // Each resolved path should point to an existing SKILL.md
        for (const skillPath of agent.resolvedSkillPaths!) {
          expect(existsSync(skillPath)).toBe(true);
        }
      }
    }

    // Step 3: Ensure .gitignore
    await service.ensureGitignore(tempDir);
    expect(existsSync(join(tempDir, ".gitignore"))).toBe(true);
  });

  it("produces agent records compatible with the agents DB schema", async () => {
    const service = new SeedingService();
    await service.copyDefaults(tempDir);
    const agents = await service.parseAgentDefinitions(tempDir);

    for (const agent of agents) {
      // Required fields present
      expect(typeof agent.name).toBe("string");
      expect(typeof agent.role).toBe("string");
      expect(typeof agent.model).toBe("string");
      expect(typeof agent.maxTurns).toBe("number");
      expect(typeof agent.systemPrompt).toBe("string");
      expect(agent.systemPrompt.length).toBeGreaterThan(0);

      // Heartbeat config present
      expect(typeof agent.heartbeat.enabled).toBe("boolean");

      // Instructions file path points to the copied AGENTS.md
      expect(agent.instructionsFilePath).toContain(".orchestrator/agents/");
      expect(agent.instructionsFilePath).toMatch(/AGENTS\.md$/);
    }

    // Verify specific agent configurations
    const cto = agents.find((a) => a.name === "cto")!;
    expect(cto.model).toBe("opus");
    expect(cto.heartbeat.enabled).toBe(true);
    expect(cto.heartbeat.intervalSec).toBe(120);

    const implementer = agents.find((a) => a.name === "implementer")!;
    expect(implementer.maxTurns).toBe(200);
    expect(implementer.skills).toContain("tdd");
    expect(implementer.skills).toContain("systematic-debugging");
    expect(implementer.skills).toContain("verification");
    expect(implementer.skills).toContain("subagent-coordination");
  });
});
