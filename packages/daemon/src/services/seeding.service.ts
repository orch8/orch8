import {
  readdir,
  readFile,
  mkdir,
  copyFile,
  appendFile,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { FastifyBaseLogger } from "fastify";
import {
  parseAgentsMd,
  stripFrontmatter,
  DEFAULT_SKILLS_DIR,
  DEFAULT_AGENTS_DIR,
  GLOBAL_SKILLS_DIR,
  type ParsedAgentsMd,
} from "@orch/shared/defaults";
import type { BundledAgent } from "@orch/shared";
import { agents, chats, projects } from "@orch/shared/db";
import { eq, and } from "drizzle-orm";
import type { SchemaDb } from "../db/client.js";

/**
 * Filename used inside each bundled-skill destination directory to record
 * which bundled-version was last copied there. Used by populateGlobalSkills
 * to decide whether a re-copy is needed (fresh install or bundled version
 * bump) vs. whether a destination already contains the current bundled
 * version (no-op fast path) vs. whether user customizations may exist and
 * we should refuse to overwrite.
 */
const VERSION_MARKER_FILE = ".orch8-version";

/**
 * Default config for a project chat agent. Id is the slug "chat", so
 * the composite PK (id, projectId) gives us one chat agent per project.
 * Skills are v1 bundled skills — the per-skill files live under
 * packages/shared/defaults/skills/ (installed by populateGlobalSkills).
 */
export const CHAT_AGENT_DEFAULTS = {
  id: "chat",
  name: "Project Chat",
  role: "custom" as const,
  model: "claude-opus-4-7",
  effort: "xhigh" as const,
  maxTurns: 180,
  heartbeatEnabled: false,
  heartbeatIntervalSec: 0,
  wakeOnAssignment: false,
  wakeOnOnDemand: true,
  wakeOnAutomation: false,
  // The chat agent is the user's conversational entry point and acts
  // with admin-level authority by default: it can create tasks, assign
  // to any agent ("*" wildcard), and move tasks through every column.
  canCreateTasks: true,
  canAssignTo: ["*"] as string[],
  canMoveTo: ["backlog", "blocked", "in_progress", "done"] as const,
  allowedTools: ["Bash", "Read", "Edit", "Write", "Grep", "Glob"],
  // Note: the `orch8` skill is ALWAYS auto-injected by claude-local-adapter
  // (see ORCH8_SKILL_PATH in claude-local-adapter.ts). We don't list it here
  // because that would double-inject. These are the 8 chat-specific skills
  // created in Plan 02.
  desiredSkills: [
    "_card-protocol",
    "brainstorm",
    "tasks",
    "agents",
    "pipelines",
    "runs",
    "cost-and-budget",
    "memory",
    "project-setup",
  ],
} as const;

const MODEL_MAP: Record<string, string> = {
  opus: "claude-opus-4-7",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

export class SeedingService {
  private logger?: FastifyBaseLogger;

  setLogger(logger: FastifyBaseLogger) {
    this.logger = logger;
  }

  /**
   * Copies all bundled skills from the package defaults to the global
   * skills directory (~/.orch8/skills/).
   *
   * Each bundled skill is version-stamped with a content hash written to
   * `<skill>/.orch8-version`. On startup we compare that marker against
   * the current bundled source hash and decide per-skill:
   *
   *   - destination missing              → fresh copy, write marker
   *   - marker present and matches hash  → fast-path no-op
   *   - marker present but differs       → WARN and leave untouched
   *     (user may have customized; do not clobber silently — the bundled
   *     version will be re-synced once we have an admin "force resync"
   *     endpoint or the user deletes the directory)
   *   - marker missing but dir exists    → WARN and leave untouched
   *     (same rationale — we cannot tell whether this directory was
   *     hand-edited by the user or left over from a prior orch8 version)
   *
   * Non-directory entries under DEFAULT_SKILLS_DIR (rare, but possible)
   * are copied unconditionally as before.
   *
   * TODO(admin): expose a "force resync" operation that blows away the
   * destination and re-copies. For now users can delete the directory
   * manually to opt into a fresh copy.
   *
   * @param targetDir — override for testing (defaults to ~/.orch8/skills/)
   */
  async populateGlobalSkills(targetDir: string = GLOBAL_SKILLS_DIR): Promise<void> {
    await mkdir(targetDir, { recursive: true });

    const entries = await readdir(DEFAULT_SKILLS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = join(DEFAULT_SKILLS_DIR, entry.name);
      const destPath = join(targetDir, entry.name);

      if (!entry.isDirectory()) {
        // Non-directory sibling (rare) — copy unconditionally; version
        // markers only make sense for skill directories.
        await copyFile(srcPath, destPath);
        continue;
      }

      const bundledVersion = await hashDirContents(srcPath);

      if (!existsSync(destPath)) {
        // Fresh install for this skill — copy and stamp.
        await mkdir(destPath, { recursive: true });
        await copyDirRecursive(srcPath, destPath);
        await writeFile(join(destPath, VERSION_MARKER_FILE), bundledVersion, "utf-8");
        continue;
      }

      // Destination exists — check for a version marker.
      const markerPath = join(destPath, VERSION_MARKER_FILE);
      let existingVersion: string | null = null;
      if (existsSync(markerPath)) {
        try {
          existingVersion = (await readFile(markerPath, "utf-8")).trim();
        } catch {
          existingVersion = null;
        }
      }

      if (existingVersion === bundledVersion) {
        // Fast path — already in sync.
        continue;
      }

      // Either the marker is missing (legacy install, possibly
      // user-edited) or it records a different version (bundled update
      // after user may have edited files). Either way we refuse to
      // clobber. Warn loudly so the operator knows their skill
      // directory is out of sync.
      this.logger?.warn(
        {
          skill: entry.name,
          destPath,
          existingVersion,
          bundledVersion,
        },
        existingVersion === null
          ? "Skipping skill sync: destination exists without version marker. User customizations may exist. Delete the directory to force a fresh copy."
          : "Skipping skill sync: bundled version changed but user customizations may exist. Delete the directory to force a fresh copy.",
      );
    }
  }

  /**
   * Copies bundled skill and agent defaults into the project's
   * .orch8/ directory. Creates the directory if needed.
   *
   * @param agentIds — which agent templates to copy (e.g. ["implementer","reviewer"]).
   *                    When omitted or empty, no agents are copied — only skills.
   */
  async copyDefaults(projectHomeDir: string, agentIds?: string[]): Promise<void> {
    const orchDir = join(projectHomeDir, ".orch8");
    const destAgents = join(orchDir, "agents");

    await mkdir(destAgents, { recursive: true });

    if (!agentIds || agentIds.length === 0) return;

    for (const id of agentIds) {
      const srcAgent = join(DEFAULT_AGENTS_DIR, id);
      if (!existsSync(srcAgent)) continue;
      const destAgent = join(destAgents, id);
      await mkdir(destAgent, { recursive: true });

      const srcAgentsMd = join(srcAgent, "AGENTS.md");
      if (existsSync(srcAgentsMd)) {
        const raw = await readFile(srcAgentsMd, "utf-8");
        await writeFile(
          join(destAgent, "AGENTS.md"),
          stripFrontmatter(raw),
          "utf-8",
        );
      }

      const srcHeartbeat = join(srcAgent, "heartbeat.md");
      if (existsSync(srcHeartbeat)) {
        await copyFile(srcHeartbeat, join(destAgent, "heartbeat.md"));
      }
    }
  }

  /**
   * Parses all AGENTS.md files in the project's .orch8/agents/
   * directory and returns structured data ready for DB insertion.
   */
  async parseAgentDefinitions(
    projectHomeDir: string,
  ): Promise<ParsedAgentsMd[]> {
    const agentsDir = join(projectHomeDir, ".orch8", "agents");
    const entries = await readdir(agentsDir);
    const results: ParsedAgentsMd[] = [];

    for (const entry of entries) {
      const agentsMdPath = join(agentsDir, entry, "AGENTS.md");
      if (!existsSync(agentsMdPath)) continue;

      // Read frontmatter from the bundled source when available; the
      // in-project copy has been stripped to prose-only during install.
      const srcBundled = join(DEFAULT_AGENTS_DIR, entry, "AGENTS.md");
      const source = existsSync(srcBundled) ? srcBundled : agentsMdPath;
      const content = await readFile(source, "utf-8");
      results.push(parseAgentsMd(content));
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

  /**
   * Lists all bundled agent templates by reading directly from the
   * defaults directory. Returns parsed configs with model shorthands
   * resolved to full model IDs. No disk copy required.
   */
  async listBundledAgents(): Promise<BundledAgent[]> {
    const entries = await readdir(DEFAULT_AGENTS_DIR);
    const results: BundledAgent[] = [];

    for (const entry of entries) {
      const agentsMdPath = join(DEFAULT_AGENTS_DIR, entry, "AGENTS.md");
      if (!existsSync(agentsMdPath)) continue;

      const content = await readFile(agentsMdPath, "utf-8");
      const parsed = parseAgentsMd(content);

      results.push({
        id: entry,
        name: parsed.name,
        role: parsed.role,
        model: MODEL_MAP[parsed.model] ?? parsed.model,
        effort: parsed.effort,
        maxTurns: parsed.maxTurns,
        skills: parsed.skills,
        heartbeatEnabled: parsed.heartbeat.enabled,
        ...(parsed.heartbeat.intervalSec != null
          ? { heartbeatIntervalSec: parsed.heartbeat.intervalSec }
          : {}),
      });
    }

    return results;
  }

  /**
   * Creates the default chat agent for a project if it doesn't exist.
   * Idempotent — safe to call on every daemon startup. Returns true if
   * a new row was inserted, false if the agent was already present.
   *
   * For pre-existing chat agents, this also backfills admin-level
   * permissions (canCreateTasks / canAssignTo / canMoveTo) when those
   * fields are still at their empty defaults. Non-empty values set by
   * the user are preserved — this only fills in gaps for rows that
   * predate the chat-agent-as-admin defaults.
   */
  async provisionChatAgent(db: SchemaDb, projectId: string): Promise<boolean> {
    const existing = await db
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.id, CHAT_AGENT_DEFAULTS.id),
          eq(agents.projectId, projectId),
        ),
      );
    if (existing.length > 0) {
      const row = existing[0];
      const patch: Partial<typeof agents.$inferInsert> = {};
      if (!row.canCreateTasks) {
        patch.canCreateTasks = CHAT_AGENT_DEFAULTS.canCreateTasks;
      }
      if (!row.canAssignTo || row.canAssignTo.length === 0) {
        patch.canAssignTo = CHAT_AGENT_DEFAULTS.canAssignTo;
      }
      if (!row.canMoveTo || row.canMoveTo.length === 0) {
        patch.canMoveTo = CHAT_AGENT_DEFAULTS.canMoveTo as unknown as typeof row.canMoveTo;
      }
      // Reconcile desiredSkills: merge in any new defaults without removing
      // user-added skills. This ensures newly bundled skills reach existing agents.
      const current = new Set(row.desiredSkills ?? []);
      const defaults = CHAT_AGENT_DEFAULTS.desiredSkills as readonly string[];
      const missing = defaults.filter((s) => !current.has(s));
      if (missing.length > 0) {
        patch.desiredSkills = [...current, ...missing];
      }
      if (Object.keys(patch).length > 0) {
        await db
          .update(agents)
          .set(patch)
          .where(
            and(
              eq(agents.id, CHAT_AGENT_DEFAULTS.id),
              eq(agents.projectId, projectId),
            ),
          );
      }
      return false;
    }

    const [project] = await db
      .select({ homeDir: projects.homeDir })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project) throw new Error(`Project not found: ${projectId}`);

    await this.copyDefaults(project.homeDir, ["chat"]);
    await this.ensureGitignore(project.homeDir);

    const defs = await this.parseAgentDefinitions(project.homeDir);
    const chatDef = defs.find((d) => d.name === "chat");
    if (!chatDef) throw new Error("chat bundled template missing");

    await db.insert(agents).values({
      id: "chat",
      projectId,
      name: chatDef.name,
      role: chatDef.role as typeof agents.$inferInsert.role,
      model: MODEL_MAP[chatDef.model] ?? chatDef.model,
      effort: chatDef.effort,
      maxTurns: chatDef.maxTurns,
      heartbeatEnabled: chatDef.heartbeat.enabled,
      heartbeatIntervalSec: chatDef.heartbeat.intervalSec ?? 0,
      wakeOnAssignment: false,
      wakeOnOnDemand: true,
      wakeOnAutomation: false,
      canCreateTasks: true,
      canAssignTo: ["*"],
      canMoveTo: ["backlog", "blocked", "in_progress", "done"] as typeof agents.$inferInsert.canMoveTo,
      allowedTools: ["Bash", "Read", "Edit", "Write", "Grep", "Glob"],
      desiredSkills: chatDef.skills,
      adapterType: "claude_local",
    });

    return true;
  }

  /**
   * For every non-chat, non-custom agent in this project, merge any bundled
   * skills that aren't already in the row's desiredSkills list. Never removes
   * skills — only fills gaps. Idempotent.
   */
  async reconcileAgentSkills(db: SchemaDb, projectId: string): Promise<void> {
    const rows = await db
      .select()
      .from(agents)
      .where(eq(agents.projectId, projectId));

    for (const row of rows) {
      if (row.role === "custom") continue;

      const bundledPath = join(DEFAULT_AGENTS_DIR, row.role, "AGENTS.md");
      if (!existsSync(bundledPath)) continue;

      const content = await readFile(bundledPath, "utf-8");
      const parsed = parseAgentsMd(content);
      const bundled = parsed.skills ?? [];

      const current = new Set(row.desiredSkills ?? []);
      const missing = bundled.filter((s) => !current.has(s));
      if (missing.length === 0) continue;

      await db
        .update(agents)
        .set({ desiredSkills: [...current, ...missing] })
        .where(and(eq(agents.id, row.id), eq(agents.projectId, projectId)));
    }
  }

  /**
   * Creates an initial "Welcome" chat for a newly provisioned chat agent,
   * if the project has no chats yet. Idempotent — safe for backfill.
   */
  async ensureInitialChat(db: SchemaDb, projectId: string): Promise<boolean> {
    const existing = await db
      .select()
      .from(chats)
      .where(eq(chats.projectId, projectId))
      .limit(1);
    if (existing.length > 0) return false;

    await db.insert(chats).values({
      projectId,
      agentId: CHAT_AGENT_DEFAULTS.id,
      title: "Welcome",
    });
    return true;
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

/**
 * Computes a stable content hash over all files in a directory (recursive).
 * Used as the bundled-skill version marker: identical source trees always
 * produce the same hash, so we can cheaply detect whether the bundled
 * skill changed between orch8 releases without requiring a manual
 * version bump.
 *
 * The hash hashes the sorted list of relative file paths plus each
 * file's content, ignoring any existing `.orch8-version` marker so the
 * destination's own marker never feeds back into the computation.
 */
async function hashDirContents(dir: string): Promise<string> {
  const hash = createHash("sha256");
  const files: string[] = [];

  async function walk(current: string, rel: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === VERSION_MARKER_FILE) continue;
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      const absPath = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(absPath, relPath);
      } else if (entry.isFile()) {
        files.push(relPath);
      }
    }
  }

  await walk(dir, "");
  files.sort();

  for (const rel of files) {
    hash.update(rel);
    hash.update("\0");
    const content = await readFile(join(dir, rel));
    hash.update(content);
    hash.update("\0");
  }

  // Prefix with a short version tag so we can evolve the hash scheme
  // without colliding with raw sha256 digests on disk.
  return `v1:${hash.digest("hex")}`;
}

