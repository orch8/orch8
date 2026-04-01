// packages/daemon/src/adapter/session-manager.ts
import { eq, and } from "drizzle-orm";
import { resolve } from "node:path";
import { taskSessions, heartbeatRuns } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import type { SessionParams } from "./types.js";

export interface SaveSessionInput {
  agentId: string;
  projectId: string;
  taskKey: string;
  adapterType: string;
  sessionId: string;
  cwd: string;
  workspaceId?: string;
  runId?: string;
}

export interface LookupSessionInput {
  agentId: string;
  taskKey: string;
  adapterType: string;
  cwd: string;
}

export interface ClearSessionInput {
  agentId: string;
  taskKey: string;
  adapterType: string;
}

export interface SessionStats {
  runCount: number;
  totalInputTokens: number;
  sessionAgeHours: number;
  latestResultText: string;
}

export class SessionManager {
  constructor(private db: SchemaDb) {}

  async saveSession(input: SaveSessionInput): Promise<void> {
    const params: SessionParams = {
      sessionId: input.sessionId,
      cwd: resolve(input.cwd),
      workspaceId: input.workspaceId,
    };

    await this.db
      .insert(taskSessions)
      .values({
        agentId: input.agentId,
        projectId: input.projectId,
        taskKey: input.taskKey,
        adapterType: input.adapterType,
        sessionParamsJson: params,
        sessionDisplayId: input.sessionId,
        lastRunId: input.runId ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [taskSessions.agentId, taskSessions.taskKey, taskSessions.adapterType],
        set: {
          sessionParamsJson: params,
          sessionDisplayId: input.sessionId,
          lastRunId: input.runId ?? null,
          updatedAt: new Date(),
        },
      });
  }

  async lookupSession(input: LookupSessionInput): Promise<SessionParams | null> {
    const rows = await this.db
      .select()
      .from(taskSessions)
      .where(
        and(
          eq(taskSessions.agentId, input.agentId),
          eq(taskSessions.taskKey, input.taskKey),
          eq(taskSessions.adapterType, input.adapterType),
        ),
      );

    if (rows.length === 0) return null;

    const params = rows[0].sessionParamsJson as SessionParams;

    // Only resume if cwd matches (spec §5.3)
    if (resolve(params.cwd) !== resolve(input.cwd)) {
      return null;
    }

    return params;
  }

  async clearSession(input: ClearSessionInput): Promise<void> {
    await this.db
      .delete(taskSessions)
      .where(
        and(
          eq(taskSessions.agentId, input.agentId),
          eq(taskSessions.taskKey, input.taskKey),
          eq(taskSessions.adapterType, input.adapterType),
        ),
      );
  }

  async getSessionStats(
    agentId: string,
    taskKey: string,
    adapterType: string,
  ): Promise<SessionStats | null> {
    // Find the session
    const rows = await this.db
      .select()
      .from(taskSessions)
      .where(
        and(
          eq(taskSessions.agentId, agentId),
          eq(taskSessions.taskKey, taskKey),
          eq(taskSessions.adapterType, adapterType),
        ),
      );

    if (rows.length === 0) return null;
    const session = rows[0];

    // Query runs since session creation
    const runs = await this.db
      .select()
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.agentId, agentId),
          eq(heartbeatRuns.taskId, taskKey),
        ),
      );

    // Filter to runs after session creation
    const sessionRuns = runs.filter(
      (r) => r.createdAt >= session.createdAt,
    );

    const totalInputTokens = sessionRuns.reduce((sum, r) => {
      const usage = r.usageJson as { input_tokens?: number } | null;
      return sum + (usage?.input_tokens ?? 0);
    }, 0);

    const sessionAgeHours =
      (Date.now() - session.createdAt.getTime()) / (1000 * 60 * 60);

    // Get latest result text
    const latestRun = sessionRuns
      .filter((r) => r.resultJson)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const latestResultText = (latestRun?.resultJson as { text?: string })?.text ?? "";

    return {
      runCount: sessionRuns.length,
      totalInputTokens,
      sessionAgeHours,
      latestResultText,
    };
  }
}
