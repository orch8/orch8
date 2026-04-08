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
  GLOBAL_SKILLS_DIR,
  type ParsedAgentsMd,
} from "@orch/shared/defaults";
import type { BundledAgent } from "@orch/shared";
import { agents, chats } from "@orch/shared/db";
import { eq, and } from "drizzle-orm";
import type { SchemaDb } from "../db/client.js";

/**
 * System prompt for the project chat agent. The agent is the user's
 * conversational entry point to orch8 — it uses skills to delegate
 * work and emits confirmation cards for any state-changing actions.
 */
export const CHAT_AGENT_SYSTEM_PROMPT = `You are the project chat assistant.

Your job is to help the user manage this orch8 project conversationally.
You have skills that teach you how to do specific things — brainstorm,
manage agents, manage tasks, build pipelines, query project state.
When the user's intent matches a skill, follow that skill's instructions.
When unclear, ask one focused clarifying question.

CARD PROTOCOL — REQUIRED:
For any action that creates, modifies, or deletes orch8 state
(agents, tasks, pipelines, etc.), you MUST emit a confirmation card
BEFORE calling the API. Format:

  \`\`\`orch8-card
  {
    "kind": "confirm_create_agent",
    "summary": "Create QA agent 'qa-bot' (sonnet, heartbeat 6h)",
    "payload": { "...the proposed config...": true }
  }
  \`\`\`

After emitting the card, STOP. The user will click Approve or Cancel.
You will receive a system message: "User approved card_<id>" or
"User cancelled card_<id>". Only AFTER an approval should you call
the API. After the API call, emit a result card (kind: "result_*").

IDS AND HYPERLINKS:
When you reference a task, run, agent, pipeline, or chat thread,
always use its canonical ID (e.g., task_abc123, run_xyz, agent_qa-bot,
pipe_pipe456). The chat UI renders these as clickable links automatically.

API access:
The orch8 REST API is reachable via Bash + curl. The orch8-api skill
explains all available endpoints. Never bypass the card protocol.`;

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
  model: "claude-sonnet-4-6",
  effort: "medium" as const,
  maxTurns: 30,
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
  ],
  systemPrompt: CHAT_AGENT_SYSTEM_PROMPT,
  promptTemplate: "{{context.userMessage}}",
} as const;

const MODEL_MAP: Record<string, string> = {
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

export interface ParsedAgentWithPaths extends ParsedAgentsMd {
  instructionsFilePath: string;
}

export class SeedingService {
  /**
   * Copies all bundled skills from the package defaults to the global
   * skills directory (~/.orch8/skills/). Always overwrites to keep
   * global skills in sync with the installed orch8 version.
   *
   * @param targetDir — override for testing (defaults to ~/.orch8/skills/)
   */
  async populateGlobalSkills(targetDir: string = GLOBAL_SKILLS_DIR): Promise<void> {
    await mkdir(targetDir, { recursive: true });
    await copyDirRecursive(DEFAULT_SKILLS_DIR, targetDir);
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

    if (agentIds && agentIds.length > 0) {
      for (const id of agentIds) {
        const srcAgent = join(DEFAULT_AGENTS_DIR, id);
        if (!existsSync(srcAgent)) continue;
        const destAgent = join(destAgents, id);
        await mkdir(destAgent, { recursive: true });
        await copyDirRecursive(srcAgent, destAgent);
      }
    }
  }

  /**
   * Parses all AGENTS.md files in the project's .orch8/agents/
   * directory and returns structured data ready for DB insertion.
   */
  async parseAgentDefinitions(
    projectHomeDir: string,
  ): Promise<ParsedAgentWithPaths[]> {
    const agentsDir = join(projectHomeDir, ".orch8", "agents");
    const entries = await readdir(agentsDir);
    const results: ParsedAgentWithPaths[] = [];

    for (const entry of entries) {
      const agentsMdPath = join(agentsDir, entry, "AGENTS.md");
      if (!existsSync(agentsMdPath)) continue;

      const content = await readFile(agentsMdPath, "utf-8");
      const parsed = parseAgentsMd(content);

      results.push({
        ...parsed,
        instructionsFilePath: agentsMdPath,
      });
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
        systemPrompt: parsed.systemPrompt,
        ...(parsed.promptTemplate != null ? { promptTemplate: parsed.promptTemplate } : {}),
        ...(parsed.bootstrapPromptTemplate != null
          ? { bootstrapPromptTemplate: parsed.bootstrapPromptTemplate }
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

    await db.insert(agents).values({
      id: CHAT_AGENT_DEFAULTS.id,
      projectId,
      name: CHAT_AGENT_DEFAULTS.name,
      role: CHAT_AGENT_DEFAULTS.role,
      model: CHAT_AGENT_DEFAULTS.model,
      effort: CHAT_AGENT_DEFAULTS.effort,
      maxTurns: CHAT_AGENT_DEFAULTS.maxTurns,
      heartbeatEnabled: CHAT_AGENT_DEFAULTS.heartbeatEnabled,
      heartbeatIntervalSec: CHAT_AGENT_DEFAULTS.heartbeatIntervalSec,
      wakeOnAssignment: CHAT_AGENT_DEFAULTS.wakeOnAssignment,
      wakeOnOnDemand: CHAT_AGENT_DEFAULTS.wakeOnOnDemand,
      wakeOnAutomation: CHAT_AGENT_DEFAULTS.wakeOnAutomation,
      canCreateTasks: CHAT_AGENT_DEFAULTS.canCreateTasks,
      canAssignTo: CHAT_AGENT_DEFAULTS.canAssignTo,
      canMoveTo: CHAT_AGENT_DEFAULTS.canMoveTo as unknown as typeof agents.$inferInsert.canMoveTo,
      allowedTools: CHAT_AGENT_DEFAULTS.allowedTools as unknown as string[],
      desiredSkills: CHAT_AGENT_DEFAULTS.desiredSkills as unknown as string[],
      systemPrompt: CHAT_AGENT_DEFAULTS.systemPrompt,
      promptTemplate: CHAT_AGENT_DEFAULTS.promptTemplate,
      adapterType: "claude_local",
    });

    return true;
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
