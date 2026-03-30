import { eq, and } from "drizzle-orm";
import {
  agents, heartbeatRuns, wakeupRequests,
} from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import { checkBudget } from "./budget.service.js";

type Agent = typeof agents.$inferSelect;
type HeartbeatRun = typeof heartbeatRuns.$inferSelect;
type WakeupRequest = typeof wakeupRequests.$inferSelect;

export type BroadcastFn = (projectId: string, message: unknown) => void;

export interface WakeupOpts {
  source: "timer" | "assignment" | "on_demand" | "automation";
  taskId?: string;
  reason?: string;
  payload?: unknown;
}

export class HeartbeatService {
  // In-memory tracking for orphan detection
  private activeRunExecutions = new Set<string>();
  private runningProcesses = new Map<string, { pid: number }>();

  // Per-agent start locks to prevent race conditions
  private agentStartLocks = new Map<string, Promise<void>>();

  constructor(
    private db: SchemaDb,
    private broadcast: BroadcastFn,
  ) {}

  shutdown(): void {
    this.activeRunExecutions.clear();
    this.runningProcesses.clear();
    this.agentStartLocks.clear();
  }

  async enqueueWakeup(
    agentId: string,
    projectId: string,
    opts: WakeupOpts,
  ): Promise<WakeupRequest> {
    // 1. Validate agent exists
    const agent = await this.loadAgent(agentId, projectId);
    if (!agent) throw new Error("Agent not found");

    // 2. Check invokability (not paused/terminated)
    if (agent.status !== "active") {
      return this.recordWakeup(agentId, projectId, opts, "skipped");
    }

    // 3. Check heartbeat policy allows this source
    if (!this.policyAllows(agent, opts.source)) {
      return this.recordWakeup(agentId, projectId, opts, "skipped");
    }

    // 4. Check budget enforcement
    const budget = await checkBudget(this.db, agentId, projectId);
    if (!budget.allowed) {
      return this.recordWakeup(agentId, projectId, opts, "budget_blocked");
    }

    // 5. Create run and wakeup (task-scoped locking handled in Task 3)
    const [run] = await this.db
      .insert(heartbeatRuns)
      .values({
        agentId,
        projectId,
        taskId: opts.taskId ?? null,
        invocationSource: opts.source,
        status: "queued",
      })
      .returning();

    const wakeup = await this.recordWakeup(
      agentId, projectId, opts, "queued", run.id,
    );

    // 6. Attempt to start queued runs
    await this.startNextQueuedRunForAgent(agentId, projectId);

    return wakeup;
  }

  async startNextQueuedRunForAgent(
    _agentId: string,
    _projectId: string,
  ): Promise<HeartbeatRun[]> {
    // Stub — implemented in Task 5
    return [];
  }

  private policyAllows(
    agent: Agent,
    source: WakeupOpts["source"],
  ): boolean {
    switch (source) {
      case "timer":
        return agent.heartbeatEnabled;
      case "assignment":
        return agent.wakeOnAssignment;
      case "on_demand":
        return agent.wakeOnOnDemand;
      case "automation":
        return agent.wakeOnAutomation;
      default:
        return false;
    }
  }

  private async loadAgent(
    agentId: string,
    projectId: string,
  ): Promise<Agent | null> {
    const [agent] = await this.db
      .select()
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)));
    return agent ?? null;
  }

  private async recordWakeup(
    agentId: string,
    projectId: string,
    opts: WakeupOpts,
    status: WakeupRequest["status"],
    runId?: string,
  ): Promise<WakeupRequest> {
    const [wakeup] = await this.db
      .insert(wakeupRequests)
      .values({
        agentId,
        projectId,
        taskId: opts.taskId ?? null,
        source: opts.source,
        reason: opts.reason ?? null,
        payload: opts.payload ?? null,
        status,
        runId: runId ?? null,
      })
      .returning();
    return wakeup;
  }
}
