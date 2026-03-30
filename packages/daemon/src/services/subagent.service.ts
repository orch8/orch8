import { eq } from "drizzle-orm";
import { heartbeatRuns } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";

type HeartbeatRun = typeof heartbeatRuns.$inferSelect;

export interface SubagentConfig {
  agentId: string;
  projectId: string;
  scope: string;
  taskId?: string;
}

export interface SubagentResult {
  status: "succeeded" | "failed" | "timed_out" | "cancelled";
  costUsd?: number;
  usageJson?: unknown;
  error?: string;
  resultJson?: unknown;
}

export class SubagentService {
  constructor(private db: SchemaDb) {}

  async registerChild(parentRunId: string, config: SubagentConfig): Promise<HeartbeatRun> {
    const [child] = await this.db.insert(heartbeatRuns).values({
      agentId: config.agentId,
      projectId: config.projectId,
      taskId: config.taskId,
      invocationSource: "automation",
      triggerDetail: `subagent:${config.scope}`,
      parentRunId,
      status: "queued",
    }).returning();

    return child;
  }

  async listChildren(parentRunId: string): Promise<HeartbeatRun[]> {
    return this.db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.parentRunId, parentRunId));
  }

  async completeChild(runId: string, result: SubagentResult): Promise<void> {
    await this.db
      .update(heartbeatRuns)
      .set({
        status: result.status,
        costUsd: result.costUsd ?? null,
        usageJson: result.usageJson ?? null,
        error: result.error ?? null,
        resultJson: result.resultJson ?? null,
        finishedAt: new Date(),
      })
      .where(eq(heartbeatRuns.id, runId));
  }
}
