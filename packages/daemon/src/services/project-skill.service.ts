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

function isExecutableScript(name: string): boolean {
  const lower = name.toLowerCase();
  // `.d.ts` is a TypeScript declaration file — type info only, never
  // executed. It reuses the `.ts` extension but should be classified
  // as an asset, not as an executable script.
  if (lower.endsWith(".d.ts")) return false;
  return SCRIPT_EXTENSIONS.has(extname(lower));
}

export function deriveTrustLevel(filenames: string[]): TrustLevel {
  let hasNonMarkdown = false;

  for (const name of filenames) {
    if (isExecutableScript(name)) return "scripts_executables";
    const ext = extname(name).toLowerCase();
    if (ext !== ".md") hasNonMarkdown = true;
  }

  return hasNonMarkdown ? "assets" : "markdown_only";
}

type ProjectSkill = typeof projectSkills.$inferSelect;

export class ProjectSkillService {
  constructor(private db: SchemaDb) {}

  async list(projectId: string): Promise<ProjectSkill[]> {
    // Side-effect free: reconciliation with disk happens in syncFromDisk.
    // A transient FS blip must not delete real data on a read.
    return this.db
      .select()
      .from(projectSkills)
      .where(eq(projectSkills.projectId, projectId));
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

    // Removing the skill row and stripping it from every agent's desiredSkills
    // must be atomic — otherwise a crash leaves dangling slug references.
    await this.db.transaction(async (tx) => {
      await tx.delete(projectSkills).where(eq(projectSkills.id, skill.id));

      const projectAgents = await tx
        .select()
        .from(agents)
        .where(eq(agents.projectId, projectId));

      for (const agent of projectAgents) {
        if (agent.desiredSkills?.includes(skill.slug)) {
          const updated = agent.desiredSkills.filter((s) => s !== skill.slug);
          await tx
            .update(agents)
            .set({ desiredSkills: updated, updatedAt: new Date() })
            .where(and(eq(agents.id, agent.id), eq(agents.projectId, projectId)));
        }
      }
    });
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

    // Read SKILL.md contents and directory inventories up front.
    // FS reads must happen outside the transaction so the tx body stays tight
    // and does not block on I/O while holding DB locks.
    interface SkillPayload {
      slug: string;
      sourceLocator: string;
      sourceType: string;
      name: string;
      description: string | null;
      content: string;
      fileInventory: Array<{ path: string; kind: string }>;
      trustLevel: TrustLevel;
    }
    const payloads: SkillPayload[] = [];
    for (const [slug, { sourceLocator, sourceType }] of effective) {
      const content = await readFile(join(sourceLocator, "SKILL.md"), "utf-8");
      const { data: fm } = matter(content);
      const files = await readdir(sourceLocator);
      const fileInventory = files.map((f) => ({
        path: f,
        kind: extname(f).toLowerCase().replace(".", "") || "unknown",
      }));
      payloads.push({
        slug,
        sourceLocator,
        sourceType,
        name: (fm.name as string) ?? slug,
        description: (fm.description as string) ?? null,
        content,
        fileInventory,
        trustLevel: deriveTrustLevel(files),
      });
    }

    // 4+5. Atomically upsert each effective skill and prune rows that are no
    // longer present on disk. Reconciliation must be all-or-nothing so a
    // crash mid-sync cannot leave the project with a half-pruned skill set.
    await this.db.transaction(async (tx) => {
      // 4. Upsert each effective skill
      for (const p of payloads) {
        const [existing] = await tx
          .select()
          .from(projectSkills)
          .where(
            and(
              eq(projectSkills.projectId, projectId),
              eq(projectSkills.slug, p.slug),
            ),
          );

        if (existing) {
          await tx
            .update(projectSkills)
            .set({
              name: p.name,
              description: p.description,
              markdown: p.content,
              sourceType: p.sourceType,
              sourceLocator: p.sourceLocator,
              trustLevel: p.trustLevel,
              fileInventory: p.fileInventory,
              updatedAt: new Date(),
            })
            .where(eq(projectSkills.id, existing.id));
        } else {
          await tx
            .insert(projectSkills)
            .values({
              projectId,
              slug: p.slug,
              name: p.name,
              description: p.description,
              markdown: p.content,
              sourceType: p.sourceType,
              sourceLocator: p.sourceLocator,
              trustLevel: p.trustLevel,
              fileInventory: p.fileInventory,
            });
        }
      }

      // 5. Prune rows not in effective set
      const allRows = await tx
        .select()
        .from(projectSkills)
        .where(eq(projectSkills.projectId, projectId));

      for (const row of allRows) {
        if (!effective.has(row.slug)) {
          await tx.delete(projectSkills).where(eq(projectSkills.id, row.id));
        }
      }
    });
  }
}
