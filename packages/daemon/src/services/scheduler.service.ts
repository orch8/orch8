import { eq, and, sql } from "drizzle-orm";
import { heartbeatRuns, projects, agents, tasks } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import type { HeartbeatService } from "./heartbeat.service.js";
import type { SummaryService } from "./summary.service.js";
import type { TaskService } from "./task.service.js";
import type { FastifyBaseLogger } from "fastify";
import type { ErrorLoggerService } from "./error-logger.service.js";

type HeartbeatRun = typeof heartbeatRuns.$inferSelect;

export interface SchedulerConfig {
  intervalMs: number;
  stalenessThresholdMs: number;
}

export class SchedulerService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private summaryTimer: ReturnType<typeof setInterval> | null = null;
  private summaryService: SummaryService | null = null;
  private logger: FastifyBaseLogger | null = null;
  private errorLogger: ErrorLoggerService | null = null;

  constructor(
    private db: SchemaDb,
    private heartbeatService: HeartbeatService,
    private config: SchedulerConfig,
  ) {}

  get intervalMs(): number {
    return this.config.intervalMs;
  }

  get activeProcessCount(): number {
    return this.heartbeatService.activeCount;
  }

  get queueDepth(): number {
    return this.heartbeatService.queueDepth;
  }

  setLogger(logger: FastifyBaseLogger): void {
    this.logger = logger;
  }

  setErrorLogger(errorLogger: ErrorLoggerService): void {
    this.errorLogger = errorLogger;
  }

  setSummaryService(summaryService: SummaryService): void {
    this.summaryService = summaryService;
  }

  private taskService: TaskService | null = null;

  setTaskService(taskService: TaskService): void {
    this.taskService = taskService;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        void this.errorLogger?.record({
          severity: "error",
          source: "scheduler",
          code: "tick_failed",
          message: "Scheduler tick failed",
          err,
        });
        this.logger?.error({ err }, "tick error");
      });
    }, this.config.intervalMs);

    // Summary regeneration — weekly (every 7 days)
    if (this.summaryService) {
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      this.summaryTimer = setInterval(() => {
        this.regenerateAllProjectSummaries().catch((err) => {
          void this.errorLogger?.record({
            severity: "error",
            source: "scheduler",
            code: "summary_regen_failed",
            message: "Project summary regeneration failed",
            err,
          });
          this.logger?.error({ err }, "summary regeneration error");
        });
      }, weekMs);
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.summaryTimer) {
      clearInterval(this.summaryTimer);
      this.summaryTimer = null;
    }
  }

  async tick(): Promise<void> {
    // 1. Timer-based wakeups
    await this.tickTimers();

    // 2. Orphan detection
    await this.reapOrphanedRuns();

    // 3. Per-project maintenance
    const activeProjects = await this.db
      .select()
      .from(projects)
      .where(eq(projects.active, true));

    for (const project of activeProjects) {
      // Unblock tasks whose dependencies are now met
      if (this.taskService) {
        const unblocked = await this.taskService.unblockResolved(project.id);
        for (const task of unblocked) {
          if (task.assignee) {
            try {
              await this.heartbeatService.enqueueWakeup(task.assignee, project.id, {
                source: "automation",
                taskId: task.id,
                reason: "task_unblocked",
              });
            } catch (err) {
              void this.errorLogger?.record({
                severity: "warn",
                source: "scheduler",
                code: "wakeup_enqueue_failed",
                message: "Failed to enqueue wakeup for unblocked task",
                err,
                projectId: project.id,
                agentId: task.assignee,
                taskId: task.id,
                metadata: { reason: "task_unblocked" },
              });
              // Skip tasks that fail to enqueue (agent may be paused/terminated)
            }
          }
        }
      }
    }
  }

  async resumeInterruptedRuns(): Promise<{ reaped: number }> {
    // On startup, no runs should be tracked in-memory.
    // Any runs still in "running" status are orphaned from a prior daemon instance.
    const reaped = await this.reapOrphanedRuns();
    return { reaped: reaped.length };
  }

  async reapOrphanedRuns(): Promise<HeartbeatRun[]> {
    const stalenessThreshold = new Date(
      Date.now() - this.config.stalenessThresholdMs,
    );

    // 1. Query all runs with status = "running"
    const runningRuns = await this.db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.status, "running"));

    const reaped: HeartbeatRun[] = [];

    for (const run of runningRuns) {
      // 2a. Skip if tracked in-memory
      if (this.heartbeatService.isRunActive(run.id)) continue;
      if (this.heartbeatService.isProcessTracked(run.id)) continue;

      // 2b. Skip if started recently (within staleness threshold)
      if (run.startedAt && run.startedAt > stalenessThreshold) continue;

      // 3. This run is orphaned — handle it
      if (run.processLossRetryCount < 1) {
        // Increment retry count and fail
        await this.db
          .update(heartbeatRuns)
          .set({
            status: "failed",
            error: "Process lost — no tracked process handle",
            errorCode: "process_lost",
            processLossRetryCount: run.processLossRetryCount + 1,
            finishedAt: new Date(),
          })
          .where(eq(heartbeatRuns.id, run.id));

        // Refresh the task row before retrying. The orphaned run row
        // may have been created minutes or hours ago; the task could
        // have been deleted, reassigned, or marked done in the
        // meantime. Using `run.taskId` verbatim would either
        // foreign-key-fail on insert (if deleted) or retry a task
        // that's no longer a valid target.
        let retryTaskId: string | null = run.taskId;
        if (run.taskId) {
          const [freshTask] = await this.db
            .select()
            .from(tasks)
            .where(eq(tasks.id, run.taskId));
          if (!freshTask) {
            this.logger?.warn(
              { runId: run.id, taskId: run.taskId },
              "reapOrphanedRuns: task no longer exists; failing retry",
            );
            retryTaskId = null;
          } else if (freshTask.column === "done") {
            this.logger?.info(
              {
                runId: run.id,
                taskId: run.taskId,
                column: freshTask.column,
              },
              "reapOrphanedRuns: task already terminal; skipping retry",
            );
            retryTaskId = null;
          } else if (
            freshTask.executionAgentId &&
            freshTask.executionAgentId !== run.agentId
          ) {
            this.logger?.info(
              {
                runId: run.id,
                taskId: run.taskId,
                originalAgent: run.agentId,
                currentAgent: freshTask.executionAgentId,
              },
              "reapOrphanedRuns: task reassigned; skipping retry",
            );
            retryTaskId = null;
          }
        }

        if (retryTaskId !== null || !run.taskId) {
          // Create a retry run only when the refreshed task is still
          // a valid target (or the original run wasn't task-scoped).
          await this.db.insert(heartbeatRuns).values({
            agentId: run.agentId,
            projectId: run.projectId,
            taskId: retryTaskId,
            invocationSource: run.invocationSource,
            status: "queued",
            retryOfRunId: run.id,
            parentRunId: run.parentRunId,
            contextSnapshot: run.contextSnapshot,
          });

          // Start the retry
          await this.heartbeatService.startNextQueuedRunForAgent(
            run.agentId,
            run.projectId,
          );
        }
      } else {
        // Retries exhausted — fail permanently
        await this.db
          .update(heartbeatRuns)
          .set({
            status: "failed",
            error: "Process lost — retries exhausted",
            errorCode: "process_lost",
            finishedAt: new Date(),
          })
          .where(eq(heartbeatRuns.id, run.id));

        // Release task lock if applicable
        if (run.taskId) {
          await this.heartbeatService.releaseTaskLock(run.taskId);
        }
      }

      // Reload the updated run for the return value
      const [updated] = await this.db
        .select()
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.id, run.id));
      reaped.push(updated);
    }

    return reaped;
  }

  async tickTimers(): Promise<Array<{ agentId: string; projectId: string }>> {
    const now = new Date();
    const woken: Array<{ agentId: string; projectId: string }> = [];

    // Find all active agents with heartbeat enabled
    const timerAgents = await this.db
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.heartbeatEnabled, true),
          eq(agents.status, "active"),
          sql`${agents.heartbeatIntervalSec} > 0`,
        ),
      );

    for (const agent of timerAgents) {
      // Check if interval has elapsed since last heartbeat
      if (agent.lastHeartbeat) {
        const nextDue = new Date(
          agent.lastHeartbeat.getTime() + agent.heartbeatIntervalSec * 1000,
        );
        if (nextDue > now) continue;
      }

      // Enqueue a timer wakeup
      try {
        await this.heartbeatService.enqueueWakeup(agent.id, agent.projectId, {
          source: "timer",
          reason: "heartbeat_interval",
        });
        woken.push({ agentId: agent.id, projectId: agent.projectId });
      } catch (err) {
        void this.errorLogger?.record({
          severity: "warn",
          source: "scheduler",
          code: "wakeup_enqueue_failed",
          message: "Failed to enqueue timer wakeup",
          err,
          projectId: agent.projectId,
          agentId: agent.id,
          metadata: { reason: "heartbeat_interval" },
        });
        // Skip agents that fail to enqueue (e.g., budget blocked)
      }
    }

    return woken;
  }

  async regenerateAllProjectSummaries(): Promise<void> {
    if (!this.summaryService) return;

    const activeProjects = await this.db
      .select()
      .from(projects)
      .where(eq(projects.active, true));

    for (const project of activeProjects) {
      const summaryDir = `${project.homeDir}/.orch8/memory/summaries`;
      await this.summaryService.regenerateAllSummaries(project.id, summaryDir);
    }
  }
}
