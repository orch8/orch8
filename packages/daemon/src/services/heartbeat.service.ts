import { eq, and, sql } from "drizzle-orm";
import {
  agents, heartbeatRuns, wakeupRequests, tasks,
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

    // 5. Task-scoped wakeup — apply task execution lock
    if (opts.taskId) {
      return this.enqueueTaskScopedWakeup(agentId, projectId, opts);
    }

    // 6. General wakeup — coalesce if queued/running run exists
    return this.enqueueGeneralWakeup(agentId, projectId, opts);
  }

  private async enqueueTaskScopedWakeup(
    agentId: string,
    projectId: string,
    opts: WakeupOpts,
  ): Promise<WakeupRequest> {
    const taskId = opts.taskId!;

    // Load task to check existing execution lock
    const [task] = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId));

    if (!task) throw new Error("Task not found");

    // Case A: Same agent already executing this task → COALESCE
    if (task.executionAgentId === agentId && task.executionRunId) {
      return this.recordWakeup(agentId, projectId, opts, "coalesced");
    }

    // Case B: Different agent executing this task → DEFER
    if (task.executionAgentId && task.executionAgentId !== agentId) {
      return this.recordWakeup(
        agentId, projectId, opts, "deferred_issue_execution",
      );
    }

    // Case C: No active execution → CLAIM lock, create run as queued
    const [run] = await this.db
      .insert(heartbeatRuns)
      .values({
        agentId,
        projectId,
        taskId,
        invocationSource: opts.source,
        status: "queued",
      })
      .returning();

    // Set execution lock on the task
    await this.db
      .update(tasks)
      .set({
        executionRunId: run.id,
        executionAgentId: agentId,
        executionLockedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    const wakeup = await this.recordWakeup(
      agentId, projectId, opts, "queued", run.id,
    );

    await this.startNextQueuedRunForAgent(agentId, projectId);
    return wakeup;
  }

  private async enqueueGeneralWakeup(
    agentId: string,
    projectId: string,
    opts: WakeupOpts,
  ): Promise<WakeupRequest> {
    // Check for existing queued or running run to coalesce into
    const [existingRun] = await this.db
      .select()
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.agentId, agentId),
          eq(heartbeatRuns.projectId, projectId),
          sql`${heartbeatRuns.taskId} IS NULL`,
          sql`${heartbeatRuns.status} IN ('queued', 'running')`,
        ),
      );

    if (existingRun) {
      return this.recordWakeup(agentId, projectId, opts, "coalesced");
    }

    // No existing run — create new queued run
    const [run] = await this.db
      .insert(heartbeatRuns)
      .values({
        agentId,
        projectId,
        taskId: null,
        invocationSource: opts.source,
        status: "queued",
      })
      .returning();

    const wakeup = await this.recordWakeup(
      agentId, projectId, opts, "queued", run.id,
    );

    await this.startNextQueuedRunForAgent(agentId, projectId);
    return wakeup;
  }

  async releaseTaskLock(taskId: string): Promise<void> {
    // Clear execution lock fields
    await this.db
      .update(tasks)
      .set({
        executionRunId: null,
        executionAgentId: null,
        executionLockedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    // Promote oldest deferred wakeup for this task
    const [deferred] = await this.db
      .select()
      .from(wakeupRequests)
      .where(
        and(
          eq(wakeupRequests.taskId, taskId),
          eq(wakeupRequests.status, "deferred_issue_execution"),
        ),
      )
      .orderBy(wakeupRequests.createdAt)
      .limit(1);

    if (deferred) {
      // Re-enqueue the deferred wakeup
      await this.enqueueWakeup(deferred.agentId, deferred.projectId, {
        source: deferred.source,
        taskId: deferred.taskId ?? undefined,
        reason: deferred.reason ?? undefined,
        payload: deferred.payload ?? undefined,
      });
    }
  }

  async claimQueuedRun(runId: string): Promise<HeartbeatRun | null> {
    // 1. Fetch the run
    const [run] = await this.db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, runId));

    if (!run) return null;

    // 2. If already running, return it (idempotent)
    if (run.status === "running") return run;

    // 3. If not queued, another process won
    if (run.status !== "queued") return null;

    // 4. Re-check budget (spec §9 — budget may have changed since enqueue)
    const budget = await checkBudget(this.db, run.agentId, run.projectId);
    if (!budget.allowed) {
      await this.db
        .update(heartbeatRuns)
        .set({
          status: "failed",
          error: budget.reason ?? "Budget blocked at claim time",
          errorCode: "budget_blocked",
          finishedAt: new Date(),
        })
        .where(eq(heartbeatRuns.id, runId));
      return null;
    }

    // 5. Atomic claim: UPDATE WHERE status = 'queued'
    const claimed = await this.db
      .update(heartbeatRuns)
      .set({
        status: "running",
        startedAt: new Date(),
      })
      .where(
        and(
          eq(heartbeatRuns.id, runId),
          eq(heartbeatRuns.status, "queued"),
        ),
      )
      .returning();

    if (claimed.length === 0) return null;

    // 6. Broadcast run status change
    this.broadcast(run.projectId, {
      type: "run_status_changed",
      runId,
      status: "running",
      agentId: run.agentId,
    });

    return claimed[0];
  }

  async startNextQueuedRunForAgent(
    agentId: string,
    projectId: string,
  ): Promise<HeartbeatRun[]> {
    // 1. Acquire per-agent start lock
    return this.withAgentLock(agentId, async () => {
      // 2. Validate agent is still invokable
      const agent = await this.loadAgent(agentId, projectId);
      if (!agent || agent.status !== "active") return [];

      // 3. Count currently running runs
      const [{ count: runningCount }] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(heartbeatRuns)
        .where(
          and(
            eq(heartbeatRuns.agentId, agentId),
            eq(heartbeatRuns.projectId, projectId),
            eq(heartbeatRuns.status, "running"),
          ),
        );

      // 4. Calculate available slots
      const availableSlots = agent.maxConcurrentRuns - runningCount;
      if (availableSlots <= 0) return [];

      // 5. Fetch queued runs in FIFO order
      const queuedRuns = await this.db
        .select()
        .from(heartbeatRuns)
        .where(
          and(
            eq(heartbeatRuns.agentId, agentId),
            eq(heartbeatRuns.projectId, projectId),
            eq(heartbeatRuns.status, "queued"),
          ),
        )
        .orderBy(heartbeatRuns.createdAt)
        .limit(availableSlots);

      // 6. Claim each run
      const claimed: HeartbeatRun[] = [];
      for (const run of queuedRuns) {
        const result = await this.claimQueuedRun(run.id);
        if (result) {
          claimed.push(result);
        }
      }

      return claimed;
    });
  }

  private async withAgentLock<T>(
    agentId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    // Wait for any existing lock on this agent
    while (this.agentStartLocks.has(agentId)) {
      await this.agentStartLocks.get(agentId);
    }

    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    this.agentStartLocks.set(agentId, promise);

    try {
      return await fn();
    } finally {
      this.agentStartLocks.delete(agentId);
      resolve();
    }
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
