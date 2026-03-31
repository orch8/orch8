import { eq, and } from "drizzle-orm";
import { agents, wakeupRequests } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import type { CreateAgent, UpdateAgent, AgentFilter } from "@orch/shared";

type Agent = typeof agents.$inferSelect;
type WakeupRequest = typeof wakeupRequests.$inferSelect;

interface WakeupOpts {
  source: "timer" | "assignment" | "on_demand" | "automation";
  taskId?: string;
  reason?: string;
  payload?: unknown;
}

const ROLE_DEFAULTS: Record<string, Partial<typeof agents.$inferInsert>> = {
  cto: {
    model: "claude-opus-4-20250514",
    maxTurns: 50,
    heartbeatEnabled: true,
    heartbeatIntervalSec: 120,
    canCreateTasks: true,
    wakeOnAssignment: true,
    wakeOnOnDemand: true,
    wakeOnAutomation: true,
    maxConcurrentRuns: 1,
  },
  engineer: {
    model: "claude-sonnet-4-20250514",
    maxTurns: 25,
    heartbeatEnabled: false,
    wakeOnAssignment: true,
    wakeOnOnDemand: true,
    maxConcurrentRuns: 1,
  },
  qa: {
    model: "claude-sonnet-4-20250514",
    maxTurns: 25,
    heartbeatEnabled: true,
    heartbeatIntervalSec: 60,
    wakeOnAssignment: true,
    wakeOnOnDemand: true,
    wakeOnAutomation: true,
    maxConcurrentRuns: 1,
  },
  researcher: {
    model: "claude-sonnet-4-20250514",
    maxTurns: 40,
    heartbeatEnabled: false,
    wakeOnAssignment: true,
    maxConcurrentRuns: 1,
  },
  planner: {
    model: "claude-sonnet-4-20250514",
    maxTurns: 30,
    heartbeatEnabled: false,
    wakeOnAssignment: true,
    maxConcurrentRuns: 1,
  },
  implementer: {
    model: "claude-sonnet-4-20250514",
    maxTurns: 40,
    heartbeatEnabled: false,
    wakeOnAssignment: true,
    maxConcurrentRuns: 1,
    maxConcurrentSubagents: 3,
  },
  reviewer: {
    model: "claude-sonnet-4-20250514",
    maxTurns: 20,
    heartbeatEnabled: false,
    wakeOnAssignment: true,
    maxConcurrentRuns: 1,
  },
  verifier: {
    model: "claude-sonnet-4-20250514",
    maxTurns: 20,
    heartbeatEnabled: false,
    wakeOnAutomation: true,
    maxConcurrentRuns: 1,
  },
  referee: {
    model: "claude-opus-4-20250514",
    maxTurns: 15,
    heartbeatEnabled: false,
    wakeOnAutomation: true,
    maxConcurrentRuns: 1,
  },
  custom: {
    model: "claude-sonnet-4-20250514",
    maxTurns: 25,
    heartbeatEnabled: false,
    wakeOnAssignment: true,
    wakeOnOnDemand: true,
    maxConcurrentRuns: 1,
  },
};

export class AgentService {
  constructor(private db: SchemaDb) {}

  static getRoleDefaults(role: string): Partial<typeof agents.$inferInsert> {
    return ROLE_DEFAULTS[role] ?? ROLE_DEFAULTS.custom;
  }

  async create(input: CreateAgent): Promise<Agent> {
    const defaults = AgentService.getRoleDefaults(input.role);
    const values: typeof agents.$inferInsert = {
      ...defaults,
      ...stripUndefined(input),
    };

    const [agent] = await this.db.insert(agents).values(values).returning();
    return agent;
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
    const {
      id: _id,
      projectId: _pid,
      status: _status,
      pauseReason: _pr,
      budgetSpentUsd: _spent,
      budgetPaused: _bp,
      lastHeartbeat: _lh,
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
      })
      .returning();

    return cloned;
  }

  async enqueueWakeup(
    agentId: string,
    projectId: string,
    opts: WakeupOpts,
  ): Promise<WakeupRequest> {
    const agent = await this.getById(agentId, projectId);
    if (!agent) throw new Error("Agent not found");
    if (agent.status === "paused") throw new Error("Cannot wake a paused agent");

    const [wakeup] = await this.db
      .insert(wakeupRequests)
      .values({
        agentId,
        projectId,
        taskId: opts.taskId ?? null,
        source: opts.source,
        reason: opts.reason ?? null,
        payload: opts.payload ?? null,
        status: "queued",
      })
      .returning();

    return wakeup;
  }
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}
