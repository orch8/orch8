import { mkdtemp, mkdir, symlink, readFile, writeFile, rm } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { tmpdir } from "node:os";

/**
 * Creates a temp directory with `.claude/skills/` containing symlinks
 * to the provided skill file paths. Returns the temp dir path
 * for use with `--add-dir`, or null if no skills given.
 */
export async function createSkillsDir(skillPaths: string[]): Promise<string | null> {
  if (skillPaths.length === 0) return null;

  const tempDir = await mkdtemp(join(tmpdir(), "orch-skills-"));
  const skillsDir = join(tempDir, ".claude", "skills");
  await mkdir(skillsDir, { recursive: true });

  for (const srcPath of skillPaths) {
    const name = basename(srcPath);
    await symlink(srcPath, join(skillsDir, name));
  }

  return tempDir;
}

/**
 * Reads an instructions markdown file, appends a path-resolution
 * directive, and writes the combined content to a temp file.
 * Returns the temp file path for use with `--append-system-prompt-file`.
 */
export async function createInstructionsFile(sourcePath: string): Promise<string> {
  const content = await readFile(sourcePath, "utf-8");
  const sourceDir = dirname(sourcePath);

  const augmented = [
    content,
    "",
    `The above agent instructions were loaded from ${sourcePath}.`,
    `Resolve any relative file references from ${sourceDir}.`,
  ].join("\n");

  const tempDir = await mkdtemp(join(tmpdir(), "orch-inst-"));
  const tempFile = join(tempDir, "instructions.md");
  await writeFile(tempFile, augmented, "utf-8");

  return tempFile;
}

/**
 * Removes a temporary file or directory. Silent on ENOENT.
 */
export async function cleanupTempPath(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}
