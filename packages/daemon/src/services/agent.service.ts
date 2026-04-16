import path from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { eq, and } from "drizzle-orm";
import { agents, projects } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import type { CreateAgent, UpdateAgent, AgentFilter } from "@orch/shared";
import type { BroadcastService } from "./broadcast.service.js";
import {
  generateAgentToken,
  hashAgentToken,
} from "../api/middleware/agent-token.js";
import { agentDir, agentsMdPath, heartbeatMdPath } from "./agent-files.js";

async function seedStubFiles(
  projectHomeDir: string,
  slug: string,
  name: string,
): Promise<void> {
  const dir = agentDir(projectHomeDir, slug);
  await mkdir(dir, { recursive: true });

  const agentsPath = agentsMdPath(projectHomeDir, slug);
  if (!existsSync(agentsPath)) {
    await writeFile(
      agentsPath,
      `# ${name}\n\nDescribe this agent's role and behavior here.\n`,
      "utf-8",
    );
  }

  const heartbeatPath = heartbeatMdPath(projectHomeDir, slug);
  if (!existsSync(heartbeatPath)) {
    await writeFile(
      heartbeatPath,
      "Describe what this agent should do on each timer wake.\n",
      "utf-8",
    );
  }
}

type Agent = typeof agents.$inferSelect;

/**
 * Result of creating a new agent. `rawToken` is the single opportunity
 * the caller has to capture the bearer credential — the hash-at-rest
 * means it cannot be recovered later; rotation produces a new token.
 */
export interface CreateAgentResult {
  agent: Agent;
  rawToken: string;
}

export const ROLE_DEFAULTS: Record<string, Partial<typeof agents.$inferInsert>> = {
  cto: {
    model: "claude-opus-4-7",
    maxTurns: 200,
    heartbeatEnabled: true,
    heartbeatIntervalSec: 3600,
    canCreateTasks: true,
    wakeOnAssignment: true,
    wakeOnOnDemand: true,
    wakeOnAutomation: true,
    maxConcurrentRuns: 1,
  },
  engineer: {
    model: "claude-opus-4-7",
    maxTurns: 200,
    heartbeatEnabled: false,
    wakeOnAssignment: true,
    wakeOnOnDemand: true,
    maxConcurrentRuns: 1,
  },
  qa: {
    model: "claude-opus-4-7",
    maxTurns: 200,
    heartbeatEnabled: true,
    heartbeatIntervalSec: 3600,
    wakeOnAssignment: true,
    wakeOnOnDemand: true,
    wakeOnAutomation: true,
    maxConcurrentRuns: 1,
  },
  researcher: {
    model: "claude-opus-4-7",
    maxTurns: 200,
    heartbeatEnabled: false,
    wakeOnAssignment: true,
    maxConcurrentRuns: 1,
  },
  planner: {
    model: "claude-opus-4-7",
    maxTurns: 200,
    heartbeatEnabled: false,
    wakeOnAssignment: true,
    maxConcurrentRuns: 1,
  },
  implementer: {
    model: "claude-opus-4-7",
    maxTurns: 200,
    heartbeatEnabled: false,
    wakeOnAssignment: true,
    maxConcurrentRuns: 1,
    maxConcurrentSubagents: 3,
  },
  reviewer: {
    model: "claude-opus-4-7",
    maxTurns: 200,
    heartbeatEnabled: false,
    wakeOnAssignment: true,
    maxConcurrentRuns: 1,
  },
  verifier: {
    model: "claude-opus-4-7",
    maxTurns: 200,
    heartbeatEnabled: false,
    wakeOnAutomation: true,
    maxConcurrentRuns: 1,
  },
  referee: {
    model: "claude-opus-4-7",
    maxTurns: 200,
    heartbeatEnabled: false,
    wakeOnAutomation: true,
    maxConcurrentRuns: 1,
  },
  custom: {
    model: "claude-opus-4-7",
    maxTurns: 200,
    heartbeatEnabled: false,
    wakeOnAssignment: true,
    wakeOnOnDemand: true,
    maxConcurrentRuns: 1,
  },
};

export class AgentService {
  constructor(
    private db: SchemaDb,
    private broadcastService?: BroadcastService,
  ) {}

  static getRoleDefaults(role: string): Partial<typeof agents.$inferInsert> {
    return ROLE_DEFAULTS[role] ?? ROLE_DEFAULTS.custom;
  }

  async create(input: CreateAgent): Promise<Agent> {
    const { agent } = await this.createWithToken(input);
    return agent;
  }

  /**
   * Creates an agent and returns the bearer token alongside. Prefer
   * this overload over `create` in any code path that needs to hand
   * the token back to a caller — the hash-at-rest design means there
   * is no other way to recover it.
   */
  async createWithToken(input: CreateAgent): Promise<CreateAgentResult> {
    const defaults = AgentService.getRoleDefaults(input.role);
    const values = {
      ...defaults,
      ...stripUndefined(input),
    } as typeof agents.$inferInsert;

    const [project] = await this.db
      .select({ homeDir: projects.homeDir })
      .from(projects)
      .where(eq(projects.id, input.projectId));

    // Auto-populate workLogDir and lessonsFile from project homeDir
    if (project && (!values.workLogDir || !values.lessonsFile)) {
      const memoryBase = path.join(project.homeDir, ".orch8", "memory");
      if (!values.workLogDir) {
        values.workLogDir = path.join(memoryBase, "logs", input.id);
      }
      if (!values.lessonsFile) {
        values.lessonsFile = path.join(memoryBase, "lessons", `${input.id}.md`);
      }
    }

    const rawToken = generateAgentToken();
    values.agentTokenHash = hashAgentToken(rawToken);

    const [agent] = await this.db.insert(agents).values(values).returning();

    if (project) {
      await seedStubFiles(project.homeDir, input.id, input.name);
    }

    return { agent, rawToken };
  }

  /**
   * Rotates the bearer token for an existing agent. Invalidates the
   * previous token immediately. Returns the new raw token — callers
   * must persist it before the next call because it is not recoverable.
   */
  async rotateAgentToken(
    agentId: string,
    projectId: string,
  ): Promise<{ agent: Agent; rawToken: string }> {
    const existing = await this.getById(agentId, projectId);
    if (!existing) throw new Error("Agent not found");

    const rawToken = generateAgentToken();
    const agentTokenHash = hashAgentToken(rawToken);

    const [updated] = await this.db
      .update(agents)
      .set({ agentTokenHash, updatedAt: new Date() })
      .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)))
      .returning();

    return { agent: updated, rawToken };
  }

  async getById(id: string, projectId: string): Promise<Agent | null> {
    const result = await this.db
      .select()
      .from(agents)
      .where(and(eq(agents.id, id), eq(agents.projectId, projectId)));
    return result[0] ?? null;
  }

  async list(filter: AgentFilter): Promise<Agent[]> {
    const conditions = [];
    if (filter.projectId) conditions.push(eq(agents.projectId, filter.projectId));
    if (filter.role) conditions.push(eq(agents.role, filter.role));
    if (filter.status) conditions.push(eq(agents.status, filter.status));

    if (conditions.length === 0) {
      return this.db.select().from(agents);
    }
    return this.db.select().from(agents).where(and(...conditions));
  }

  async update(id: string, projectId: string, input: UpdateAgent): Promise<Agent> {
    const [updated] = await this.db
      .update(agents)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(agents.id, id), eq(agents.projectId, projectId)))
      .returning();

    if (!updated) throw new Error("Agent not found");
    return updated;
  }

  async delete(id: string, projectId: string): Promise<void> {
    const result = await this.db
      .delete(agents)
      .where(and(eq(agents.id, id), eq(agents.projectId, projectId)))
      .returning();
    if (result.length === 0) throw new Error("Agent not found");
  }

  async pause(id: string, projectId: string, reason?: string): Promise<Agent> {
    const agent = await this.getById(id, projectId);
    if (!agent) throw new Error("Agent not found");
    if (agent.status === "paused") throw new Error("Agent is already paused");

    const [updated] = await this.db
      .update(agents)
      .set({
        status: "paused",
        pauseReason: reason ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(agents.id, id), eq(agents.projectId, projectId)))
      .returning();

    this.broadcastService?.agentPaused(projectId, {
      agentId: id,
      reason: reason ?? null,
    });

    return updated;
  }

  async resume(id: string, projectId: string): Promise<Agent> {
    const agent = await this.getById(id, projectId);
    if (!agent) throw new Error("Agent not found");
    if (agent.status !== "paused") throw new Error("Agent is not paused");

    const [updated] = await this.db
      .update(agents)
      .set({
        status: "active",
        pauseReason: null,
        updatedAt: new Date(),
      })
      .where(and(eq(agents.id, id), eq(agents.projectId, projectId)))
      .returning();

    this.broadcastService?.agentResumed(projectId, { agentId: id });

    return updated;
  }

  async clone(
    id: string,
    projectId: string,
    opts: { targetProjectId: string; newId: string },
  ): Promise<Agent> {
    const source = await this.getById(id, projectId);
    if (!source) throw new Error("Agent not found");

    // IMPORTANT: When adding new columns to agents table,
    // decide if they belong in definition (copied) or runtime (reset below).
    // `agentTokenHash` is explicitly reset — each cloned agent gets a
    // brand-new bearer credential so leaking the source agent's token
    // does not implicitly unlock its clones.
    const {
      id: _id,
      projectId: _pid,
      status: _status,
      pauseReason: _pr,
      budgetSpentUsd: _spent,
      budgetPaused: _bp,
      lastHeartbeat: _lh,
      agentTokenHash: _ath,
      createdAt: _ca,
      updatedAt: _ua,
      ...definition
    } = source;

    const [cloned] = await this.db
      .insert(agents)
      .values({
        ...definition,
        id: opts.newId,
        projectId: opts.targetProjectId,
        status: "active",
        pauseReason: null,
        budgetSpentUsd: 0,
        budgetPaused: false,
        lastHeartbeat: null,
        agentTokenHash: hashAgentToken(generateAgentToken()),
      })
      .returning();

    return cloned;
  }

}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}
