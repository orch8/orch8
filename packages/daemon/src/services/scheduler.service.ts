import { eq, and, sql } from "drizzle-orm";
import { heartbeatRuns, projects, agents } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import type { HeartbeatService } from "./heartbeat.service.js";
import type { SummaryService } from "./summary.service.js";

type HeartbeatRun = typeof heartbeatRuns.$inferSelect;

export interface SchedulerConfig {
  intervalMs: number;
  stalenessThresholdMs: number;
}

export class SchedulerService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private summaryTimer: ReturnType<typeof setInterval> | null = null;
  private summaryService: SummaryService | null = null;

  constructor(
    private db: SchemaDb,
    private heartbeatService: HeartbeatService,
    private config: SchedulerConfig,
  ) {}

  setSummaryService(summaryService: SummaryService): void {
    this.summaryService = summaryService;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.reapOrphanedRuns().catch((err) => {
        console.error("[SchedulerService] orphan reap error:", err);
      });
    }, this.config.intervalMs);

    // Summary regeneration — weekly (every 7 days)
    if (this.summaryService) {
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      this.summaryTimer = setInterval(() => {
        this.regenerateAllProjectSummaries().catch((err) => {
          console.error("[SchedulerService] summary regeneration error:", err);
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

        // Create a retry run
        await this.db.insert(heartbeatRuns).values({
          agentId: run.agentId,
          projectId: run.projectId,
          taskId: run.taskId,
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
      } catch {
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
      const summaryDir = `${project.homeDir}/.orch/memory/summaries`;
      await this.summaryService.regenerateAllSummaries(project.id, summaryDir);
    }
  }
}
