import { eq, and, sql } from "drizzle-orm";
import {
  agents, heartbeatRuns, wakeupRequests, tasks, projects, runEvents,
} from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import { checkBudget, autoPauseIfExhausted } from "./budget.service.js";
import type { AgentAdapter, RunAgentInstructions } from "../adapter/types.js";
import type { WakeReason } from "../adapter/prompt-builder.js";
import type { ClaudeLocalAdapterConfig, RunContext, RunResult, RuntimeStreamEvent } from "../adapter/types.js";
import type { CodexLocalAdapterConfig } from "../adapter/codex-local/types.js";
import type { MemoryExtractionService } from "./memory-extraction.service.js";
import type { BroadcastService } from "./broadcast.service.js";
import type { PipelineService } from "./pipeline.service.js";
import type { FastifyBaseLogger } from "fastify";
import { RunLogger, type LogHandle } from "./run-logger.js";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
import { mapStreamEvent } from "../adapter/tool-mapper.js";
import { SessionManager } from "../adapter/session-manager.js";
import { resolveAdapter, type AdapterMap } from "../adapter/registry.js";
import { readAgentToken } from "./agent-token-store.js";

type Agent = typeof agents.$inferSelect;
type HeartbeatRun = typeof heartbeatRuns.$inferSelect;
type WakeupRequest = typeof wakeupRequests.$inferSelect;

export type BroadcastFn = (projectId: string, message: unknown) => void;

export interface CompactionPolicy {
  enabled: boolean;
  maxSessionRuns: number;
  maxRawInputTokens: number;
  maxSessionAgeHours: number;
}

export interface SessionStats {
  runCount: number;
  totalInputTokens: number;
  sessionAgeHours: number;
}

export interface CompactionResult {
  needsRotation: boolean;
  reason?: string;
}

export interface WakeupOpts {
  source: "timer" | "assignment" | "on_demand" | "automation";
  taskId?: string;
  reason?: string;
  payload?: unknown;
  idempotencyKey?: string;
}

async function getRepoUrl(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["config", "--get", "remote.origin.url"], { cwd });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

export class HeartbeatService {
  // In-memory tracking for orphan detection
  private activeRunExecutions = new Set<string>();
  private runningProcesses = new Map<string, { pid: number }>();

  // Per-agent start locks to prevent race conditions
  private agentStartLocks = new Map<string, Promise<void>>();

  private adapters: AdapterMap | null = null;
  private extractionService: MemoryExtractionService | null = null;
  private logger: FastifyBaseLogger | null = null;
  private onRunCompleted?: (taskId: string, status: string) => Promise<void>;
  private sessionManager: SessionManager | null = null;
  private apiUrl: string = "http://localhost:3847";
  private pipelineService: PipelineService | null = null;

  setLogger(logger: FastifyBaseLogger): void {
    this.logger = logger;
  }

  constructor(
    private db: SchemaDb,
    private broadcastService: BroadcastService,
  ) {}

  shutdown(): void {
    this.activeRunExecutions.clear();
    this.runningProcesses.clear();
    this.agentStartLocks.clear();
  }

  private getLogDir(projectHomeDir: string): string {
    return path.join(projectHomeDir, ".orch8", "logs");
  }

  setAdapter(adapter: AgentAdapter): void {
    this.adapters = {
      claude_local: adapter,
      codex_local: adapter,
    };
  }

  setAdapters(adapters: AdapterMap): void {
    this.adapters = adapters;
  }

  setExtractionService(service: MemoryExtractionService): void {
    this.extractionService = service;
  }

  setOnRunCompleted(fn: (taskId: string, status: string) => Promise<void>): void {
    this.onRunCompleted = fn;
  }

  setSessionManager(sessionManager: SessionManager): void {
    this.sessionManager = sessionManager;
  }

  setApiUrl(url: string): void {
    this.apiUrl = url;
  }

  /**
   * Inject the app-wide `PipelineService` so the per-run hot path
   * doesn't dynamically `import()` the module and spin up a fresh
   * `PipelineService` every launch. Optional for tests that don't
   * exercise pipeline-linked tasks.
   */
  setPipelineService(service: PipelineService): void {
    this.pipelineService = service;
  }

  get activeCount(): number {
    return this.activeRunExecutions.size;
  }

  get queueDepth(): number {
    return this.activeRunExecutions.size;
  }

  isRunActive(runId: string): boolean {
    return this.activeRunExecutions.has(runId);
  }

  isProcessTracked(runId: string): boolean {
    return this.runningProcesses.has(runId);
  }

  checkCompactionThresholds(
    policy: CompactionPolicy,
    stats: SessionStats,
  ): CompactionResult {
    if (!policy.enabled) {
      return { needsRotation: false };
    }

    if (policy.maxSessionRuns > 0 && stats.runCount > policy.maxSessionRuns) {
      return {
        needsRotation: true,
        reason: `maxSessionRuns exceeded (${stats.runCount} > ${policy.maxSessionRuns})`,
      };
    }

    if (policy.maxRawInputTokens > 0 && stats.totalInputTokens > policy.maxRawInputTokens) {
      return {
        needsRotation: true,
        reason: `maxRawInputTokens exceeded (${stats.totalInputTokens} > ${policy.maxRawInputTokens})`,
      };
    }

    if (policy.maxSessionAgeHours > 0 && stats.sessionAgeHours > policy.maxSessionAgeHours) {
      return {
        needsRotation: true,
        reason: `maxSessionAgeHours exceeded (${stats.sessionAgeHours} > ${policy.maxSessionAgeHours})`,
      };
    }

    return { needsRotation: false };
  }

  async enqueueWakeup(
    agentId: string,
    projectId: string,
    opts: WakeupOpts,
  ): Promise<WakeupRequest> {
    // 0. Idempotency key deduplication
    if (opts.idempotencyKey) {
      const [existing] = await this.db
        .select()
        .from(wakeupRequests)
        .where(
          and(
            eq(wakeupRequests.agentId, agentId),
            eq(wakeupRequests.projectId, projectId),
            eq(wakeupRequests.idempotencyKey, opts.idempotencyKey),
          ),
        )
        .limit(1);

      if (existing) {
        return this.recordWakeup(agentId, projectId, opts, "coalesced");
      }
    }

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

    // Coalesce if there's already a queued/running run for this agent + task
    const [existingRun] = await this.db
      .select()
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.agentId, agentId),
          eq(heartbeatRuns.projectId, projectId),
          eq(heartbeatRuns.taskId, taskId),
          sql`${heartbeatRuns.status} IN ('queued', 'running')`,
        ),
      );

    if (existingRun) {
      return this.recordWakeup(agentId, projectId, opts, "coalesced");
    }

    // Create new queued run — no lock or transition on the task
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

    this.broadcastService.runCreated(projectId, {
      runId: run.id,
      agentId,
      status: "queued",
      taskId,
    });

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

    // Broadcast run_created (spec §14 §2.1)
    this.broadcastService.runCreated(projectId, {
      runId: run.id,
      agentId,
      status: "queued",
    });

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
    this.broadcastService.runCreated(run.projectId, {
      runId,
      agentId: run.agentId,
      status: "running",
    });

    return claimed[0];
  }

  async executeRun(runId: string): Promise<void> {
    // 1. Fetch run
    const [run] = await this.db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, runId));

    if (!run) return;

    // Return if already in terminal state
    if (!["queued", "running"].includes(run.status)) return;

    // 2. If queued, attempt claim
    let claimedRun = run;
    if (run.status === "queued") {
      const claimed = await this.claimQueuedRun(runId);
      if (!claimed) return;
      claimedRun = claimed;
    }

    // 3. Add to in-memory tracking (skip if already executing)
    if (this.activeRunExecutions.has(runId)) return;
    this.activeRunExecutions.add(runId);

    let logHandle: LogHandle | undefined;
    let runLogger: RunLogger | undefined;
    // Buffered run_events inserts, flushed in the finally block below.
    type RunEventInsert = typeof runEvents.$inferInsert;
    const pendingRunEventInserts: RunEventInsert[] = [];

    try {
      // 4. Fetch agent configuration
      const agent = await this.loadAgent(claimedRun.agentId, claimedRun.projectId);
      if (!agent) {
        await this.failRun(runId, "Agent not found", "agent_not_found");
        return;
      }

      // 5. Load project for cwd
      const [project] = await this.db
        .select()
        .from(projects)
        .where(eq(projects.id, claimedRun.projectId));

      if (!project) {
        await this.failRun(runId, "Project not found", "project_not_found");
        return;
      }

      // 6. Resolve working directory and load task context
      const cwd = project.homeDir;
      let taskData: typeof tasks.$inferSelect | undefined;
      if (claimedRun.taskId) {
        const [task] = await this.db
          .select()
          .from(tasks)
          .where(eq(tasks.id, claimedRun.taskId));
        taskData = task;
      }

      // 7. Invoke adapter
      if (!this.adapters) {
        await this.failRun(runId, "No adapters configured", "no_adapter");
        return;
      }
      const adapter = resolveAdapter(agent.adapterType, this.adapters, this.logger ?? undefined);

      // 7b. Setup run log capture (spec §14 §2.2) — after adapter check
      const logDir = this.getLogDir(cwd);
      await mkdir(logDir, { recursive: true });
      runLogger = new RunLogger(logDir);
      logHandle = runLogger.create(runId);

      const adapterConfig = this.buildAdapterConfig(agent, cwd, adapter.type);

      // Real-time event emission (run viewer spec).
      //
      // The dashboard listens to the WebSocket broadcast for live streaming,
      // so broadcasts still fire synchronously per event. DB inserts, however,
      // used to be unawaited fire-and-forget `.catch(console.error)` — under a
      // fast token stream hundreds of promises piled up with no backpressure,
      // and a DB outage silently dropped events through console.error instead
      // of the structured logger.
      //
      // We now buffer InsertRunEvent rows in memory and flush them with a
      // single multi-row insert in the run-cleanup finally block below. This
      // bounds promise accumulation, provides backpressure naturally, and
      // funnels any insert failure through the structured logger.
      let eventSeq = 0;
      const onEvent = (rawEvent: RuntimeStreamEvent): void => {
        const mapped = mapStreamEvent(rawEvent);
        for (const m of mapped) {
          const seq = eventSeq++;
          const timestamp = new Date().toISOString();

          pendingRunEventInserts.push({
            runId,
            projectId: claimedRun.projectId,
            seq,
            timestamp: new Date(),
            eventType: m.eventType,
            toolName: m.toolName,
            summary: m.summary,
            payload: rawEvent.rawPayload,
          });

          this.broadcastService.runEvent(claimedRun.projectId, {
            runId,
            seq,
            eventType: m.eventType,
            toolName: m.toolName,
            summary: m.summary,
            timestamp,
            payload: rawEvent.rawPayload,
          });
        }
      };

      // Phase 3: Look up wakeup request for commentId
      let wakeCommentId: string | undefined;
      const [wakeupReq] = await this.db
        .select()
        .from(wakeupRequests)
        .where(eq(wakeupRequests.runId, runId));
      if (wakeupReq?.commentId) {
        wakeCommentId = wakeupReq.commentId;
      }

      const workspaceRepoUrl = await getRepoUrl(cwd);
      const agentToken = await readAgentToken(project.homeDir, agent.id);
      if (!agentToken && agent.agentTokenHash) {
        await this.failRun(
          runId,
          "Agent token file missing - rotate the agent's token",
          "missing_agent_token",
        );
        return;
      }

      const finishStrategy = taskData?.taskType !== "brainstorm"
        ? (taskData?.finishStrategy ?? project.finishStrategy ?? "merge") as "pr" | "merge" | "none"
        : undefined;

      const ctx: RunContext = {
        agentId: agent.id,
        agentName: agent.name,
        agentRole: agent.role,
        projectId: claimedRun.projectId,
        runId,
        taskId: claimedRun.taskId ?? undefined,
        wakeReason: claimedRun.invocationSource,
        apiUrl: process.env.ORCH_API_URL ?? this.apiUrl,
        agentToken: agentToken ?? undefined,
        cwd,
        logStream: logHandle.stream,
        taskTitle: taskData?.title,
        taskDescription: taskData?.description ?? undefined,
        onEvent,

        // Phase 3: Workspace metadata
        workspaceId: claimedRun.projectId,
        finishStrategy,
        workspaceRepoUrl,

        // Phase 3: Wake trigger details
        wakeCommentId,

        // Phase 3: Task linkage
        linkedIssueIds: taskData?.linkedIssueIds?.join(",") ?? undefined,

        // Pipeline context
        pipelineContext: undefined as string | undefined,
        pipelineOutputFilePath: undefined as string | undefined,
      };

      // Inject pipeline context if this task belongs to a pipeline step.
      // Use the app-wide PipelineService singleton; falling back to a
      // lazily-constructed one keeps tests that never call
      // setPipelineService() functional, but production always injects.
      if (taskData?.pipelineId && taskData?.pipelineStepId) {
        const pipelineService = this.pipelineService
          ?? await this.getFallbackPipelineService();
        const pipelineData = await pipelineService.findByTaskId(taskData.id);
        if (pipelineData) {
          ctx.pipelineContext = await pipelineService.buildStepContext(
            pipelineData.pipeline.id,
            pipelineData.step.order,
          );
          ctx.pipelineOutputFilePath = pipelineData.step.outputFilePath ?? undefined;
        }
      }

      const wake: WakeReason = (() => {
        switch (claimedRun.invocationSource) {
          case "timer":
            return { source: "timer" };
          case "assignment":
            return {
              source: "assignment",
              task: {
                title: taskData?.title ?? "(no title)",
                description: taskData?.description ?? undefined,
              },
            };
          case "on_demand": {
            // Real producers of on_demand wakes (e.g. /api/agents/:id/wake)
            // don't populate triggerDetail — they pass the caller's message
            // via wakeupRequests.reason, and some producers set payload.
            // Walk a fallback chain so the agent always receives a non-empty
            // userMessage, otherwise the adapter prompt ends up blank.
            const userMessage =
              claimedRun.triggerDetail
              ?? (typeof wakeupReq?.payload === "string" ? wakeupReq.payload : undefined)
              ?? (typeof wakeupReq?.reason === "string" ? wakeupReq.reason : undefined)
              ?? "(on_demand wake — no message provided)";
            return { source: "on_demand", userMessage };
          }
          case "automation":
            return {
              source: "automation",
              automation: {
                trigger: claimedRun.triggerDetail ?? "automation",
                payload: typeof wakeupReq?.payload === "string" ? wakeupReq.payload : undefined,
              },
            };
        }
      })();

      const instructions: RunAgentInstructions = {
        projectRoot: project.homeDir,
        slug: agent.id,
        wake,
        desiredSkills: agent.desiredSkills ?? undefined,
      };

      // Phase 4: Session compaction — evaluate before launching process
      if (agent.sessionCompactionEnabled && this.sessionManager && claimedRun.taskId) {
        try {
          const taskKey = claimedRun.taskId;
          const stats = await this.sessionManager.getSessionStats(
            agent.id, taskKey, adapter.type,
          );

          if (stats) {
            const policy: CompactionPolicy = {
              enabled: true,
              maxSessionRuns: agent.sessionMaxRuns ?? 0,
              maxRawInputTokens: agent.sessionMaxInputTokens ?? 0,
              maxSessionAgeHours: agent.sessionMaxAgeHours ?? 0,
            };

            const compactionResult = this.checkCompactionThresholds(policy, stats);
            if (compactionResult.needsRotation) {
              this.logger?.info(
                { agentId: agent.id, runId, reason: compactionResult.reason },
                "Session compaction: rotating session",
              );

              // Build handoff note from structured template
              const handoff = [
                "Session rotated:",
                `- Task: ${taskData?.title ?? "unknown"}`,
                `- Rotation reason: ${compactionResult.reason}`,
                `- Last run summary: ${stats.latestResultText.slice(0, 500)}`,
                "Continue from the current task state. Rebuild only the minimum context you need.",
              ].join("\n");

              // Clear the old session
              await this.sessionManager.clearSession({
                agentId: agent.id,
                taskKey,
                adapterType: adapter.type,
              });

              // Set sessionHandoff on instructions so the adapter includes it
              instructions.sessionHandoff = handoff;
            }
          }
        } catch (compactionErr) {
          this.logger?.error(
            { err: compactionErr, agentId: agent.id, runId },
            "Session compaction evaluation failed, continuing without rotation",
          );
        }
      }

      const result = await adapter.runAgent(adapterConfig, ctx, instructions);

      // 8. Record results AND update budget atomically.
      //
      // These writes must be committed together so any observer waiting on
      // the run's status transition (e.g. `waitForRunComplete` polling in
      // tests, or the dashboard via broadcast) sees the budget update at the
      // same moment as the terminal status. Previously the budget lived in
      // a separate follow-up transaction, which opened a window where the
      // run looked "succeeded" but the agent/project budget counters hadn't
      // incremented yet — reproducible under full-suite load and surfaced
      // as flaky integration tests.
      //
      // autoPauseIfExhausted also reads and possibly writes agent/project
      // rows and must see the just-incremented budget; it is therefore
      // called inside the same transaction with the tx handle.
      const terminalStatus = this.resolveTerminalStatus(result);
      await this.db.transaction(async (tx) => {
        await tx
          .update(heartbeatRuns)
          .set({
            status: terminalStatus,
            exitCode: result.exitCode,
            signal: result.signal,
            error: result.error,
            errorCode: result.errorCode,
            usageJson: result.usage,
            resultJson: result.result ? { text: result.result } : null,
            costUsd: result.costUsd,
            billingType: result.billingType,
            model: result.model,
            sessionIdAfter: result.sessionId,
            finishedAt: new Date(),
          })
          .where(eq(heartbeatRuns.id, runId));

        if (result.costUsd && result.costUsd > 0) {
          await tx
            .update(agents)
            .set({
              budgetSpentUsd: sql`${agents.budgetSpentUsd} + ${result.costUsd}`,
              lastHeartbeat: new Date(),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(agents.id, agent.id),
                eq(agents.projectId, claimedRun.projectId),
              ),
            );

          await tx
            .update(projects)
            .set({
              budgetSpentUsd: sql`${projects.budgetSpentUsd} + ${result.costUsd}`,
              updatedAt: new Date(),
            })
            .where(eq(projects.id, claimedRun.projectId));

          // Auto-pause if budget exhausted (spec §9.2.4).
          await autoPauseIfExhausted(tx, agent.id, claimedRun.projectId, this.broadcastService);
        }
      });

      // 8b. Finalize run log (spec §14 §2.2). Outside the transaction above
      // because the log metadata is not atomicity-critical — a crash here
      // leaves logStore/logRef null but the run itself is already marked
      // terminal with the correct cost, which is the important invariant.
      const logResult = await runLogger.finalize(logHandle);
      logHandle = undefined; // Prevent double-finalize in finally
      await this.db
        .update(heartbeatRuns)
        .set({
          logStore: logResult.logStore,
          logRef: logResult.logRef,
          logBytes: logResult.logBytes,
        })
        .where(eq(heartbeatRuns.id, runId));

      // 10. Broadcast completion
      if (terminalStatus === "succeeded") {
        this.broadcastService.runCompleted(claimedRun.projectId, {
          runId,
          agentId: agent.id,
          status: terminalStatus,
          costUsd: result.costUsd,
        });
      } else {
        this.broadcastService.runFailed(claimedRun.projectId, {
          runId,
          agentId: agent.id,
          status: terminalStatus,
          error: result.error,
        });
      }

      // 10b. Trigger work log extraction (fire-and-forget)
      if (this.extractionService && terminalStatus === "succeeded" && agent.workLogDir) {
        this.triggerExtraction(agent, claimedRun.projectId).catch((err) => {
          this.logger?.error(
            { err, agentId: agent.id, projectId: claimedRun.projectId, runId },
            "extraction error",
          );
        });
      }

      // 10c. Notify lifecycle of run completion
      if (claimedRun.taskId && terminalStatus === "succeeded" && this.onRunCompleted) {
        try {
          await this.onRunCompleted(claimedRun.taskId, terminalStatus);
        } catch (err) {
          this.logger?.error(
            { err, taskId: claimedRun.taskId, runId, status: terminalStatus },
            "onRunCompleted callback failed",
          );
        }
      }
    } catch (err) {
      await this.failRun(
        runId,
        (err as Error).message,
        "execution_error",
      );
    } finally {
      // Flush buffered run_events in a single multi-row insert. Failures are
      // logged through the structured logger so a DB outage during streaming
      // no longer silently drops events or terminates the run.
      if (pendingRunEventInserts.length > 0) {
        try {
          await this.db.insert(runEvents).values(pendingRunEventInserts);
        } catch (eventsErr) {
          this.logger?.error(
            {
              err: eventsErr,
              runId,
              count: pendingRunEventInserts.length,
            },
            "Failed to flush buffered run_events at stream end",
          );
        }
      }

      // Clean up log stream if it was opened but not finalized
      if (logHandle && runLogger) {
        try {
          await runLogger.finalize(logHandle);
        } catch {
          // Best-effort cleanup — don't let log finalization crash the run cleanup
        }
      }
      // 11. Crash recovery — release any tasks locked by this run
      try {
        const lockedTasks = await this.db
          .select({ id: tasks.id })
          .from(tasks)
          .where(eq(tasks.executionRunId, runId));
        for (const t of lockedTasks) {
          await this.releaseTaskLock(t.id);
        }
      } catch (lockErr) {
        this.logger?.error(
          { err: lockErr, runId },
          "Failed to release task locks during run cleanup",
        );
      }

      // 12. Start next queued run
      await this.startNextQueuedRunForAgent(
        claimedRun.agentId,
        claimedRun.projectId,
      );

      // 13. Remove from tracking
      this.activeRunExecutions.delete(runId);
      this.runningProcesses.delete(runId);
    }
  }

  private resolveTerminalStatus(
    result: RunResult,
  ): "succeeded" | "failed" | "timed_out" {
    if (result.errorCode === "timeout") return "timed_out";
    if (result.exitCode === 0 && !result.errorCode) return "succeeded";
    return "failed";
  }

  private async triggerExtraction(
    agent: Agent,
    projectId: string,
  ): Promise<void> {
    if (!this.extractionService || !agent.workLogDir) return;

    // Read the most recent work log entry
    const { readdir, readFile } = await import("node:fs/promises");
    const path = await import("node:path");

    let files: string[];
    try {
      files = await readdir(agent.workLogDir);
    } catch {
      return;
    }

    const mdFiles = files.filter(f => f.endsWith(".md")).sort().reverse();
    if (mdFiles.length === 0) return;

    const latestFile = mdFiles[0];
    const content = await readFile(path.join(agent.workLogDir, latestFile), "utf-8");

    // Find entities related to this project
    const { knowledgeEntities: keTable } = await import("@orch/shared/db");
    const { eq } = await import("drizzle-orm");

    const entities = await this.db
      .select()
      .from(keTable)
      .where(eq(keTable.projectId, projectId));

    // Extract to the first entity (or skip if none exist)
    if (entities.length > 0) {
      await this.extractionService.extractFromWorklogContent(
        content,
        entities[0].id,
        agent.id,
      );
    }
  }

  private async failRun(
    runId: string,
    error: string,
    errorCode: string,
  ): Promise<void> {
    // Fetch run to get projectId and agentId for broadcast
    const [run] = await this.db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, runId));

    await this.db
      .update(heartbeatRuns)
      .set({
        status: "failed",
        error,
        errorCode,
        finishedAt: new Date(),
      })
      .where(eq(heartbeatRuns.id, runId));

    if (run) {
      this.broadcastService.runFailed(run.projectId, {
        runId,
        agentId: run.agentId,
        status: "failed",
        error,
      });
    }
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

      // 7. Execute claimed runs (fire-and-forget)
      for (const run of claimed) {
        this.executeRun(run.id).catch((err) => {
          this.logger?.error(
            { err, runId: run.id, agentId, projectId },
            "Unhandled error in executeRun",
          );
        });
      }

      return claimed;
    });
  }

  /**
   * Serialize async work per agentId. Callers queue by chaining their "next"
   * promise onto the current tail — the previous busy-wait loop allowed two
   * concurrent callers to race past the `has()` check and run `fn` in parallel.
   * Here we always chain: the tail in the map is the promise that the *next*
   * caller must await before running, guaranteeing strict FIFO ordering.
   */
  private async withAgentLock<T>(
    agentId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const prev = this.agentStartLocks.get(agentId) ?? Promise.resolve();

    let release!: () => void;
    const next = new Promise<void>((r) => { release = r; });

    // Publish the new tail atomically with the read of `prev` above — since
    // this whole method is sync up to the first await, interleaving cannot
    // happen here.
    const tail = prev.then(() => next);
    this.agentStartLocks.set(agentId, tail);

    try {
      await prev;
      return await fn();
    } finally {
      release();
      // Only clear the map entry if nobody else queued behind us. If another
      // caller has already replaced the tail, leaving it alone is correct.
      if (this.agentStartLocks.get(agentId) === tail) {
        this.agentStartLocks.delete(agentId);
      }
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

  private buildAdapterConfig(
    agent: Agent,
    cwd: string,
    adapterType: string,
  ): ClaudeLocalAdapterConfig | CodexLocalAdapterConfig {
    const baseConfig = (agent.adapterConfig ?? {}) as Record<string, unknown>;
    const env = {
      ...((baseConfig.env as Record<string, string> | undefined) ?? {}),
      ...((agent.envVars as Record<string, string> | null) ?? {}),
    };

    if (adapterType === "codex_local") {
      return {
        ...(baseConfig as CodexLocalAdapterConfig),
        model: (baseConfig as CodexLocalAdapterConfig).model ?? agent.model ?? undefined,
        cwd,
        env,
      };
    }

    return {
      ...(baseConfig as ClaudeLocalAdapterConfig),
      model: agent.model ?? (baseConfig as ClaudeLocalAdapterConfig).model,
      effort: (agent.effort as ClaudeLocalAdapterConfig["effort"] | null)
        ?? (baseConfig as ClaudeLocalAdapterConfig).effort,
      maxTurnsPerRun: agent.maxTurns ?? (baseConfig as ClaudeLocalAdapterConfig).maxTurnsPerRun,
      cwd,
      env,
    };
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
        idempotencyKey: opts.idempotencyKey ?? null,
        status,
        runId: runId ?? null,
      })
      .returning();
    return wakeup;
  }

  /**
   * Lazily build a PipelineService if none has been injected. Cached
   * on `this.pipelineService` so the dynamic `import()` only happens
   * once per instance (vs the previous per-run pattern). Tests and
   * standalone `new HeartbeatService(...)` callers that touch a
   * pipeline-linked task hit this path; production always injects
   * via `setPipelineService` from `server.ts`.
   */
  private async getFallbackPipelineService(): Promise<PipelineService> {
    if (this.pipelineService) return this.pipelineService;
    const { PipelineService: Svc } = await import("./pipeline.service.js");
    const { PipelineTemplateService } = await import(
      "./pipeline-template.service.js"
    );
    this.pipelineService = new Svc(this.db, new PipelineTemplateService(this.db));
    return this.pipelineService;
  }
}
