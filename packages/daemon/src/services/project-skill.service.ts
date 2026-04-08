import { eq, and, or } from "drizzle-orm";
import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { existsSync } from "node:fs";
import { projectSkills, agents } from "@orch/shared/db";
import { GLOBAL_SKILLS_DIR } from "@orch/shared/defaults";
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
      if (row.sourceLocator && !existsSync(row.sourceLocator)) {
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
    input: { slug: string; sourceLocator: string; sourceType?: string },
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
        sourceType: input.sourceType ?? "local_path",
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

  async syncFromDisk(
    projectId: string,
    projectHomeDir: string,
    globalSkillsDir: string = GLOBAL_SKILLS_DIR,
  ): Promise<void> {
    const localDir = join(projectHomeDir, ".orch8", "skills");

    // 1. Scan global skills (excluding orch8)
    const globalSlugs = new Map<string, string>();
    if (existsSync(globalSkillsDir)) {
      const entries = await readdir(globalSkillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === "orch8") continue;
        if (!existsSync(join(globalSkillsDir, entry.name, "SKILL.md"))) continue;
        globalSlugs.set(entry.name, join(globalSkillsDir, entry.name));
      }
    }

    // 2. Scan project-local skills
    const localSlugs = new Map<string, string>();
    if (existsSync(localDir)) {
      const entries = await readdir(localDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (!existsSync(join(localDir, entry.name, "SKILL.md"))) continue;
        localSlugs.set(entry.name, join(localDir, entry.name));
      }
    }

    // 3. Build effective set: local overrides global
    const effective = new Map<string, { sourceLocator: string; sourceType: string }>();
    for (const [slug, loc] of globalSlugs) {
      if (!localSlugs.has(slug)) {
        effective.set(slug, { sourceLocator: loc, sourceType: "global" });
      }
    }
    for (const [slug, loc] of localSlugs) {
      effective.set(slug, { sourceLocator: loc, sourceType: "local_path" });
    }

    // 4. Upsert each effective skill
    for (const [slug, { sourceLocator, sourceType }] of effective) {
      const existing = await this.get(projectId, slug);
      if (existing) {
        const content = await readFile(join(sourceLocator, "SKILL.md"), "utf-8");
        const { data: fm } = matter(content);
        const files = await readdir(sourceLocator);
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
            sourceType,
            sourceLocator,
            trustLevel: deriveTrustLevel(files),
            fileInventory,
            updatedAt: new Date(),
          })
          .where(eq(projectSkills.id, existing.id));
      } else {
        await this.create(projectId, { slug, sourceLocator, sourceType });
      }
    }

    // 5. Prune rows not in effective set
    const allRows = await this.db
      .select()
      .from(projectSkills)
      .where(eq(projectSkills.projectId, projectId));

    for (const row of allRows) {
      if (!effective.has(row.slug)) {
        await this.db.delete(projectSkills).where(eq(projectSkills.id, row.id));
      }
    }
  }
}
