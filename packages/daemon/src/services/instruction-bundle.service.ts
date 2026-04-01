import { eq, and } from "drizzle-orm";
import { readdir, readFile, writeFile, rm, mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { instructionBundles, agents } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";

type InstructionBundle = typeof instructionBundles.$inferSelect;

const DEFAULT_ENTRY_FILE = "AGENTS.md";

function safePath(rootPath: string, relativePath: string): string {
  const resolved = resolve(rootPath, relativePath);
  if (!resolved.startsWith(rootPath + "/") && resolved !== rootPath) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

function defaultBundleDir(projectId: string, agentId: string, basePath?: string): string {
  const root = basePath ?? join(homedir(), ".orch8");
  return join(root, "projects", projectId, "agents", agentId, "instructions");
}

function defaultTemplate(role: string): string {
  return [
    "---",
    `name: ${role}`,
    `role: ${role}`,
    "---",
    "",
    `# ${role.charAt(0).toUpperCase() + role.slice(1)}`,
    "",
    "Your instructions here.",
    "",
  ].join("\n");
}

export class InstructionBundleService {
  constructor(private db: SchemaDb, private basePath?: string) {}

  async get(agentId: string, projectId: string): Promise<InstructionBundle | null> {
    const rows = await this.db
      .select()
      .from(instructionBundles)
      .where(
        and(
          eq(instructionBundles.agentId, agentId),
          eq(instructionBundles.projectId, projectId),
        ),
      );
    return rows[0] ?? null;
  }

  async ensure(agentId: string, projectId: string, role: string): Promise<InstructionBundle> {
    const existing = await this.get(agentId, projectId);
    if (existing) return existing;

    const rootPath = defaultBundleDir(projectId, agentId, this.basePath);
    await mkdir(rootPath, { recursive: true });

    // Seed default AGENTS.md
    const entryPath = join(rootPath, DEFAULT_ENTRY_FILE);
    if (!existsSync(entryPath)) {
      await writeFile(entryPath, defaultTemplate(role), "utf-8");
    }

    const inventory = await this.buildInventory(rootPath);

    const [row] = await this.db
      .insert(instructionBundles)
      .values({
        agentId,
        projectId,
        mode: "managed",
        rootPath,
        entryFile: DEFAULT_ENTRY_FILE,
        fileInventory: inventory,
      })
      .onConflictDoUpdate({
        target: [instructionBundles.agentId, instructionBundles.projectId],
        set: { updatedAt: new Date() },
      })
      .returning();

    // Sync agent instructionsFilePath
    await this.db
      .update(agents)
      .set({
        instructionsFilePath: join(rootPath, DEFAULT_ENTRY_FILE),
        updatedAt: new Date(),
      })
      .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)));

    return row;
  }

  async updateMode(
    agentId: string,
    projectId: string,
    input: { mode: string; rootPath?: string; entryFile?: string },
  ): Promise<void> {
    const bundle = await this.get(agentId, projectId);
    if (!bundle) throw new Error("Bundle not found");

    const rootPath = input.rootPath ?? bundle.rootPath;
    const entryFile = input.entryFile ?? bundle.entryFile;

    await this.db
      .update(instructionBundles)
      .set({
        mode: input.mode,
        rootPath,
        entryFile,
        updatedAt: new Date(),
      })
      .where(eq(instructionBundles.id, bundle.id));

    // Sync agent instructionsFilePath
    await this.db
      .update(agents)
      .set({
        instructionsFilePath: join(rootPath, entryFile),
        updatedAt: new Date(),
      })
      .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)));
  }

  async readFile(agentId: string, projectId: string, relativePath: string): Promise<string> {
    const bundle = await this.get(agentId, projectId);
    if (!bundle) throw new Error("Bundle not found");

    const fullPath = safePath(bundle.rootPath, relativePath);
    return readFile(fullPath, "utf-8");
  }

  async writeFile(
    agentId: string,
    projectId: string,
    relativePath: string,
    content: string,
  ): Promise<void> {
    const bundle = await this.get(agentId, projectId);
    if (!bundle) throw new Error("Bundle not found");
    if (bundle.mode === "external") throw new Error("Cannot write to external mode bundle");

    const fullPath = safePath(bundle.rootPath, relativePath);
    await writeFile(fullPath, content, "utf-8");

    // Re-sync inventory
    const inventory = await this.buildInventory(bundle.rootPath);
    await this.db
      .update(instructionBundles)
      .set({ fileInventory: inventory, updatedAt: new Date() })
      .where(eq(instructionBundles.id, bundle.id));
  }

  async deleteFile(agentId: string, projectId: string, relativePath: string): Promise<void> {
    const bundle = await this.get(agentId, projectId);
    if (!bundle) throw new Error("Bundle not found");
    if (bundle.mode === "external") throw new Error("Cannot delete from external mode bundle");
    if (relativePath === bundle.entryFile) throw new Error("Cannot delete entry file");

    const fullPath = safePath(bundle.rootPath, relativePath);
    await rm(fullPath);

    const inventory = await this.buildInventory(bundle.rootPath);
    await this.db
      .update(instructionBundles)
      .set({ fileInventory: inventory, updatedAt: new Date() })
      .where(eq(instructionBundles.id, bundle.id));
  }

  async listFiles(agentId: string, projectId: string): Promise<Array<{ path: string; size: number; updatedAt: string }>> {
    const bundle = await this.get(agentId, projectId);
    if (!bundle) return [];
    return this.buildInventory(bundle.rootPath);
  }

  async recover(
    agentId: string,
    projectId: string,
    role: string,
  ): Promise<"recovered" | "skipped" | "ok"> {
    const bundle = await this.get(agentId, projectId);
    if (!bundle) {
      await this.ensure(agentId, projectId, role);
      return "recovered";
    }

    const entryPath = join(bundle.rootPath, bundle.entryFile);
    if (existsSync(entryPath)) return "ok";

    if (bundle.mode === "managed") {
      await mkdir(bundle.rootPath, { recursive: true });
      await writeFile(entryPath, defaultTemplate(role), "utf-8");
      // Re-sync inventory
      const inventory = await this.buildInventory(bundle.rootPath);
      await this.db
        .update(instructionBundles)
        .set({ fileInventory: inventory, updatedAt: new Date() })
        .where(eq(instructionBundles.id, bundle.id));
      return "recovered";
    }

    // External mode — can't fix it
    return "skipped";
  }

  private async buildInventory(
    rootPath: string,
  ): Promise<Array<{ path: string; size: number; updatedAt: string }>> {
    if (!existsSync(rootPath)) return [];
    const entries = await readdir(rootPath);
    const inventory: Array<{ path: string; size: number; updatedAt: string }> = [];

    for (const entry of entries) {
      const fullPath = join(rootPath, entry);
      const st = await stat(fullPath);
      if (st.isFile()) {
        inventory.push({
          path: entry,
          size: st.size,
          updatedAt: st.mtime.toISOString(),
        });
      }
    }

    return inventory;
  }
}
