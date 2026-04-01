import {
  readdir,
  readFile,
  mkdir,
  copyFile,
  appendFile,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import {
  parseAgentsMd,
  DEFAULT_SKILLS_DIR,
  DEFAULT_AGENTS_DIR,
  type ParsedAgentsMd,
} from "@orch/shared";

export interface ParsedAgentWithPaths extends ParsedAgentsMd {
  resolvedSkillPaths?: string[];
  instructionsFilePath: string;
}

export class SeedingService {
  /**
   * Copies bundled skill and agent defaults into the project's
   * .orch8/ directory. Creates the directory if needed.
   *
   * @param agentIds — which agent templates to copy (e.g. ["implementer","reviewer"]).
   *                    When omitted or empty, no agents are copied — only skills.
   */
  async copyDefaults(projectHomeDir: string, agentIds?: string[]): Promise<void> {
    const orchDir = join(projectHomeDir, ".orch8");
    const destSkills = join(orchDir, "skills");
    const destAgents = join(orchDir, "agents");

    await mkdir(destSkills, { recursive: true });
    await mkdir(destAgents, { recursive: true });

    await copyDirRecursive(DEFAULT_SKILLS_DIR, destSkills);

    if (agentIds && agentIds.length > 0) {
      for (const id of agentIds) {
        const srcAgent = join(DEFAULT_AGENTS_DIR, id);
        if (!existsSync(srcAgent)) continue;
        const destAgent = join(destAgents, id);
        await mkdir(destAgent, { recursive: true });
        await copyDirRecursive(srcAgent, destAgent);
      }
    }
  }

  /**
   * Parses all AGENTS.md files in the project's .orch8/agents/
   * directory and returns structured data ready for DB insertion.
   */
  async parseAgentDefinitions(
    projectHomeDir: string,
  ): Promise<ParsedAgentWithPaths[]> {
    const agentsDir = join(projectHomeDir, ".orch8", "agents");
    const entries = await readdir(agentsDir);
    const results: ParsedAgentWithPaths[] = [];

    for (const entry of entries) {
      const agentsMdPath = join(agentsDir, entry, "AGENTS.md");
      if (!existsSync(agentsMdPath)) continue;

      const content = await readFile(agentsMdPath, "utf-8");
      const parsed = parseAgentsMd(content);

      // Resolve skill names to absolute paths
      const skillsDir = join(projectHomeDir, ".orch8", "skills");
      const resolvedSkillPaths = parsed.skills.map((skillName) =>
        join(skillsDir, skillName, "SKILL.md"),
      );

      results.push({
        ...parsed,
        resolvedSkillPaths,
        instructionsFilePath: agentsMdPath,
      });
    }

    return results;
  }

  /**
   * Ensures .orch8/ is in the project's .gitignore.
   * Creates .gitignore if it doesn't exist.
   * Only appends — never modifies existing entries.
   */
  async ensureGitignore(projectHomeDir: string): Promise<void> {
    const gitignorePath = join(projectHomeDir, ".gitignore");

    if (!existsSync(gitignorePath)) {
      await writeFile(
        gitignorePath,
        "# orch8 orchestrator data\n.orch8/\n",
      );
      return;
    }

    const content = await readFile(gitignorePath, "utf-8");

    // Check if .orch8/ is already covered
    if (content.includes(".orch8/")) return;

    const suffix = content.endsWith("\n") ? "" : "\n";
    await appendFile(
      gitignorePath,
      `${suffix}\n# orch8 orchestrator data\n.orch8/\n`,
    );
  }
}

/**
 * Recursively copies a directory and its contents.
 */
async function copyDirRecursive(src: string, dest: string): Promise<void> {
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await mkdir(destPath, { recursive: true });
      await copyDirRecursive(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}
