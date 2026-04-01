import { eq, and, or } from "drizzle-orm";
import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { existsSync } from "node:fs";
import { projectSkills, agents } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import matter from "gray-matter";

export type TrustLevel = "markdown_only" | "assets" | "scripts_executables";

const SCRIPT_EXTENSIONS = new Set([".sh", ".js", ".ts", ".py", ".rb"]);

export function deriveTrustLevel(filenames: string[]): TrustLevel {
  let hasNonMarkdown = false;

  for (const name of filenames) {
    const ext = extname(name).toLowerCase();
    if (SCRIPT_EXTENSIONS.has(ext)) return "scripts_executables";
    if (ext !== ".md") hasNonMarkdown = true;
  }

  return hasNonMarkdown ? "assets" : "markdown_only";
}

type ProjectSkill = typeof projectSkills.$inferSelect;

export class ProjectSkillService {
  constructor(private db: SchemaDb) {}

  async list(projectId: string): Promise<ProjectSkill[]> {
    const rows = await this.db
      .select()
      .from(projectSkills)
      .where(eq(projectSkills.projectId, projectId));

    // Auto-prune: remove rows whose local_path source directory is missing
    const valid: ProjectSkill[] = [];
    for (const row of rows) {
      if (row.sourceType === "local_path" && row.sourceLocator && !existsSync(row.sourceLocator)) {
        await this.db.delete(projectSkills).where(eq(projectSkills.id, row.id));
      } else {
        valid.push(row);
      }
    }

    return valid;
  }

  async get(projectId: string, slugOrId: string): Promise<ProjectSkill | null> {
    const rows = await this.db
      .select()
      .from(projectSkills)
      .where(
        and(
          eq(projectSkills.projectId, projectId),
          or(
            eq(projectSkills.slug, slugOrId),
            eq(projectSkills.id, slugOrId),
          ),
        ),
      );

    return rows[0] ?? null;
  }

  async create(
    projectId: string,
    input: { slug: string; sourceLocator: string },
  ): Promise<ProjectSkill> {
    const skillMdPath = join(input.sourceLocator, "SKILL.md");
    const content = await readFile(skillMdPath, "utf-8");
    const { data: fm } = matter(content);

    const files = await readdir(input.sourceLocator);
    const fileInventory = files.map((f) => ({
      path: f,
      kind: extname(f).toLowerCase().replace(".", "") || "unknown",
    }));
    const trustLevel = deriveTrustLevel(files);

    const [row] = await this.db
      .insert(projectSkills)
      .values({
        projectId,
        slug: input.slug,
        name: (fm.name as string) ?? input.slug,
        description: (fm.description as string) ?? null,
        markdown: content,
        sourceType: "local_path",
        sourceLocator: input.sourceLocator,
        trustLevel,
        fileInventory,
      })
      .returning();

    return row;
  }

  async delete(projectId: string, slugOrId: string): Promise<void> {
    const skill = await this.get(projectId, slugOrId);
    if (!skill) return;

    // Remove DB row
    await this.db.delete(projectSkills).where(eq(projectSkills.id, skill.id));

    // Strip slug from all agents' desiredSkills in this project
    const projectAgents = await this.db
      .select()
      .from(agents)
      .where(eq(agents.projectId, projectId));

    for (const agent of projectAgents) {
      if (agent.desiredSkills?.includes(skill.slug)) {
        const updated = agent.desiredSkills.filter((s) => s !== skill.slug);
        await this.db
          .update(agents)
          .set({ desiredSkills: updated, updatedAt: new Date() })
          .where(and(eq(agents.id, agent.id), eq(agents.projectId, projectId)));
      }
    }
  }

  async syncFromDisk(projectId: string, projectHomeDir: string): Promise<void> {
    const skillsDir = join(projectHomeDir, ".orch8", "skills");
    if (!existsSync(skillsDir)) return;

    const entries = await readdir(skillsDir, { withFileTypes: true });
    const diskSlugs = new Set<string>();

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillMdPath = join(skillsDir, entry.name, "SKILL.md");
      if (!existsSync(skillMdPath)) continue;

      const slug = entry.name;
      diskSlugs.add(slug);

      const existing = await this.get(projectId, slug);
      if (existing) {
        // Re-sync content from disk
        const content = await readFile(skillMdPath, "utf-8");
        const { data: fm } = matter(content);
        const files = await readdir(join(skillsDir, entry.name));
        const fileInventory = files.map((f) => ({
          path: f,
          kind: extname(f).toLowerCase().replace(".", "") || "unknown",
        }));

        await this.db
          .update(projectSkills)
          .set({
            name: (fm.name as string) ?? slug,
            description: (fm.description as string) ?? null,
            markdown: content,
            trustLevel: deriveTrustLevel(files),
            fileInventory,
            updatedAt: new Date(),
          })
          .where(eq(projectSkills.id, existing.id));
      } else {
        await this.create(projectId, {
          slug,
          sourceLocator: join(skillsDir, entry.name),
        });
      }
    }

    // Prune rows that no longer exist on disk
    const allRows = await this.db
      .select()
      .from(projectSkills)
      .where(eq(projectSkills.projectId, projectId));

    for (const row of allRows) {
      if (row.sourceType === "local_path" && !diskSlugs.has(row.slug)) {
        await this.db.delete(projectSkills).where(eq(projectSkills.id, row.id));
      }
    }
  }
}
