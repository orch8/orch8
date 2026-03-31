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
   * .orchestrator/ directory. Creates the directory if needed.
   */
  async copyDefaults(projectHomeDir: string): Promise<void> {
    const orchDir = join(projectHomeDir, ".orchestrator");
    const destSkills = join(orchDir, "skills");
    const destAgents = join(orchDir, "agents");

    await mkdir(destSkills, { recursive: true });
    await mkdir(destAgents, { recursive: true });

    await copyDirRecursive(DEFAULT_SKILLS_DIR, destSkills);
    await copyDirRecursive(DEFAULT_AGENTS_DIR, destAgents);
  }

  /**
   * Parses all AGENTS.md files in the project's .orchestrator/agents/
   * directory and returns structured data ready for DB insertion.
   */
  async parseAgentDefinitions(
    projectHomeDir: string,
  ): Promise<ParsedAgentWithPaths[]> {
    const agentsDir = join(projectHomeDir, ".orchestrator", "agents");
    const entries = await readdir(agentsDir);
    const results: ParsedAgentWithPaths[] = [];

    for (const entry of entries) {
      const agentsMdPath = join(agentsDir, entry, "AGENTS.md");
      if (!existsSync(agentsMdPath)) continue;

      const content = await readFile(agentsMdPath, "utf-8");
      const parsed = parseAgentsMd(content);

      // Resolve skill names to absolute paths
      const skillsDir = join(projectHomeDir, ".orchestrator", "skills");
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
   * Ensures .orchestrator/ is in the project's .gitignore.
   * Creates .gitignore if it doesn't exist.
   * Only appends — never modifies existing entries.
   */
  async ensureGitignore(projectHomeDir: string): Promise<void> {
    const gitignorePath = join(projectHomeDir, ".gitignore");

    if (!existsSync(gitignorePath)) {
      await writeFile(
        gitignorePath,
        "# orch8 orchestrator data\n.orchestrator/\n",
      );
      return;
    }

    const content = await readFile(gitignorePath, "utf-8");

    // Check if .orchestrator/ is already covered
    if (content.includes(".orchestrator/")) return;

    const suffix = content.endsWith("\n") ? "" : "\n";
    await appendFile(
      gitignorePath,
      `${suffix}\n# orch8 orchestrator data\n.orchestrator/\n`,
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
