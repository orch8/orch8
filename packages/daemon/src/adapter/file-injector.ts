import { mkdtemp, mkdir, symlink, readFile, writeFile, rm, unlink } from "node:fs/promises";
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
    // Use parent directory name as subdirectory to avoid collisions
    // (all skill files are named SKILL.md, so basename alone would collide)
    const parentName = basename(dirname(srcPath));
    const skillSubDir = join(skillsDir, parentName);
    await mkdir(skillSubDir, { recursive: true });
    const dest = join(skillSubDir, basename(srcPath));
    // Remove any existing symlink to avoid EEXIST when duplicates are passed
    await unlink(dest).catch(() => {});
    await symlink(srcPath, dest);
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
