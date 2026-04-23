import { lstat, mkdir, readdir, readlink, rm, symlink } from "node:fs/promises";
import path from "node:path";

export interface CodexSkillLink {
  name: string;
  target: string;
}

export async function listCodexSkills(codexHome: string): Promise<CodexSkillLink[]> {
  const skillsDir = path.join(codexHome, "skills");
  await mkdir(skillsDir, { recursive: true });
  const entries = await readdir(skillsDir);
  const links: CodexSkillLink[] = [];

  for (const name of entries) {
    const fullPath = path.join(skillsDir, name);
    const stat = await lstat(fullPath).catch(() => null);
    if (!stat?.isSymbolicLink()) continue;
    links.push({ name, target: await readlink(fullPath) });
  }

  return links;
}

export async function syncCodexSkills(codexHome: string, desiredSkillPaths: string[]): Promise<void> {
  const skillsDir = path.join(codexHome, "skills");
  await mkdir(skillsDir, { recursive: true });

  const desired = new Map<string, string>();
  for (const skillPath of desiredSkillPaths) {
    const target = path.basename(skillPath) === "SKILL.md" ? path.dirname(skillPath) : skillPath;
    desired.set(path.basename(target), target);
  }

  const existing = await listCodexSkills(codexHome);
  for (const link of existing) {
    const wantedTarget = desired.get(link.name);
    if (!wantedTarget || wantedTarget !== link.target) {
      await rm(path.join(skillsDir, link.name), { recursive: true, force: true });
    }
  }

  for (const [name, target] of desired) {
    const linkPath = path.join(skillsDir, name);
    const stat = await lstat(linkPath).catch(() => null);
    if (stat) continue;
    await symlink(target, linkPath, "dir");
  }
}
