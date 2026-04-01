import { describe, it, expect, afterEach } from "vitest";
import { existsSync, readFileSync, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  createSkillsDir,
  createInstructionsFile,
  cleanupTempPath,
} from "../../adapter/file-injector.js";

const tempPaths: string[] = [];

afterEach(async () => {
  for (const p of tempPaths) {
    await rm(p, { recursive: true, force: true });
  }
  tempPaths.length = 0;
});

describe("createSkillsDir", () => {
  it("creates temp dir with symlinks under .claude/skills/<parent>/", async () => {
    // Set up source skill files (mimic real layout: <skill-name>/SKILL.md)
    const srcDir = await mkdtemp(join(tmpdir(), "skill-src-"));
    tempPaths.push(srcDir);
    await mkdir(join(srcDir, "tdd"));
    await mkdir(join(srcDir, "verification"));
    await writeFile(join(srcDir, "tdd", "SKILL.md"), "# TDD");
    await writeFile(join(srcDir, "verification", "SKILL.md"), "# Verification");

    const result = await createSkillsDir([
      join(srcDir, "tdd", "SKILL.md"),
      join(srcDir, "verification", "SKILL.md"),
    ]);
    expect(result).not.toBeNull();
    tempPaths.push(result!);

    // Verify directory structure
    const skillsPath = join(result!, ".claude", "skills");
    expect(existsSync(skillsPath)).toBe(true);

    // Verify symlinks in subdirectories (avoids SKILL.md name collisions)
    const entries = readdirSync(skillsPath);
    expect(entries).toContain("tdd");
    expect(entries).toContain("verification");
    expect(lstatSync(join(skillsPath, "tdd", "SKILL.md")).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(skillsPath, "verification", "SKILL.md")).isSymbolicLink()).toBe(true);
  });

  it("returns null when given empty array", async () => {
    const result = await createSkillsDir([]);
    expect(result).toBeNull();
  });
});

describe("createInstructionsFile", () => {
  it("creates temp file with content and path resolution directive", async () => {
    const srcDir = await mkdtemp(join(tmpdir(), "inst-src-"));
    tempPaths.push(srcDir);
    const srcFile = join(srcDir, "AGENTS.md");
    await writeFile(srcFile, "# My Instructions\n\nDo the thing.");

    const result = await createInstructionsFile(srcFile);
    tempPaths.push(result);

    const content = readFileSync(result, "utf-8");
    expect(content).toContain("# My Instructions");
    expect(content).toContain("Do the thing.");
    expect(content).toContain(`loaded from ${srcFile}`);
    expect(content).toContain(`Resolve any relative file references from ${srcDir}`);
  });
});

describe("cleanupTempPath", () => {
  it("removes a temp directory", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "cleanup-test-"));
    expect(existsSync(tempDir)).toBe(true);

    await cleanupTempPath(tempDir);
    expect(existsSync(tempDir)).toBe(false);
  });

  it("does not throw if path does not exist", async () => {
    await expect(cleanupTempPath("/tmp/nonexistent-path-12345")).resolves.toBeUndefined();
  });
});
