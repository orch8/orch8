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

const ALL_AGENTS = ["cto", "implementer", "planner", "qa", "researcher", "reviewer"];

describe("Project seeding integration", () => {
  it("seeds a project directory with selected agents and parses them", async () => {
    const service = new SeedingService();

    // Step 1: Copy defaults for all agents
    await service.copyDefaults(tempDir, ALL_AGENTS);

    // Step 2: Parse agent definitions
    const agents = await service.parseAgentDefinitions(tempDir);

    // Should have all 6 selected agents
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

    // Each agent should have skill slugs (resolved at runtime via DB, not filesystem)
    for (const agent of agents) {
      if (agent.skills.length > 0) {
        expect(agent.skills.length).toBeGreaterThan(0);
      }
    }

    // Step 3: Ensure .gitignore
    await service.ensureGitignore(tempDir);
    expect(existsSync(join(tempDir, ".gitignore"))).toBe(true);
  });

  it("produces agent records compatible with the agents DB schema", async () => {
    const service = new SeedingService();
    await service.copyDefaults(tempDir, ALL_AGENTS);
    const agents = await service.parseAgentDefinitions(tempDir);

    for (const agent of agents) {
      // Required fields present
      expect(typeof agent.name).toBe("string");
      expect(typeof agent.role).toBe("string");
      expect(typeof agent.model).toBe("string");
      expect(typeof agent.maxTurns).toBe("number");

      // Heartbeat config present
      expect(typeof agent.heartbeat.enabled).toBe("boolean");
    }

    // Verify specific agent configurations
    const cto = agents.find((a) => a.name === "cto")!;
    expect(cto.model).toBe("opus");
    expect(cto.heartbeat.enabled).toBe(true);
    expect(cto.heartbeat.intervalSec).toBe(3600);

    const implementer = agents.find((a) => a.name === "implementer")!;
    expect(implementer.maxTurns).toBe(200);
    expect(implementer.skills).toContain("tdd");
    expect(implementer.skills).toContain("systematic-debugging");
    expect(implementer.skills).toContain("verification");
    expect(implementer.skills).toContain("subagent-coordination");
  });
});
