import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, and, sql, desc } from "drizzle-orm";
import { heartbeatRuns } from "@orch/shared/db";
import { CostSummaryQuerySchema, CostTimeseriesQuerySchema } from "@orch/shared";
import "../../types.js";

export async function costRoutes(app: FastifyInstance) {
  // GET /api/cost/summary — Aggregated cost by project/agent
  app.get("/api/cost/summary", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = CostSummaryQuerySchema.safeParse(request.query);
    const filter = parsed.success ? parsed.data : {};
    const projectId = filter.projectId ?? request.projectId;

    // Agents must have a projectId; admins can omit for cross-project view
    if (request.agent && !projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    const conditions = [];
    if (projectId) conditions.push(eq(heartbeatRuns.projectId, projectId));
    if (filter.agentId) conditions.push(eq(heartbeatRuns.agentId, filter.agentId));

    const byAgent = conditions.length > 0
      ? await app.db
          .select({
            agentId: heartbeatRuns.agentId,
            totalCost: sql<number>`COALESCE(SUM(${heartbeatRuns.costUsd}), 0)`.as("totalCost"),
            runCount: sql<number>`COUNT(*)`.as("runCount"),
          })
          .from(heartbeatRuns)
          .where(and(...conditions))
          .groupBy(heartbeatRuns.agentId)
      : await app.db
          .select({
            agentId: heartbeatRuns.agentId,
            totalCost: sql<number>`COALESCE(SUM(${heartbeatRuns.costUsd}), 0)`.as("totalCost"),
            runCount: sql<number>`COUNT(*)`.as("runCount"),
          })
          .from(heartbeatRuns)
          .groupBy(heartbeatRuns.agentId);

    const total = byAgent.reduce((sum, row) => sum + Number(row.totalCost), 0);

    return { total, byAgent };
  });

  // GET /api/cost/timeseries — Time-series cost data
  app.get("/api/cost/timeseries", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = CostTimeseriesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
    }

    const { projectId, days } = parsed.data;

    // Enforce project scoping for agent callers
    if (request.agent && request.projectId && projectId !== request.projectId) {
      return reply.code(403).send({ error: "forbidden", message: "Cannot query cost data for another project" });
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const series = await app.db.execute(sql`
      SELECT
        DATE(finished_at AT TIME ZONE 'UTC')::text AS date,
        agent_id AS "agentId",
        COALESCE(SUM(cost_usd), 0)::float AS "totalCost",
        COUNT(*)::int AS "runCount"
      FROM heartbeat_runs
      WHERE project_id = ${projectId}
        AND finished_at >= ${since}::timestamptz
        AND cost_usd IS NOT NULL
      GROUP BY DATE(finished_at AT TIME ZONE 'UTC'), agent_id
      ORDER BY date DESC
    `);

    return series as unknown as Array<{ date: string; agentId: string; totalCost: number; runCount: number }>;
  });

  // GET /api/cost/task/:taskId — Per-task cost breakdown
  app.get("/api/cost/task/:taskId", async (request: FastifyRequest<{ Params: { taskId: string } }>, reply: FastifyReply) => {
    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    const runs = await app.db
      .select({
        id: heartbeatRuns.id,
        agentId: heartbeatRuns.agentId,
        costUsd: heartbeatRuns.costUsd,
        status: heartbeatRuns.status,
        startedAt: heartbeatRuns.startedAt,
        finishedAt: heartbeatRuns.finishedAt,
      })
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.taskId, request.params.taskId),
          eq(heartbeatRuns.projectId, projectId),
        ),
      )
      .orderBy(desc(heartbeatRuns.createdAt));

    const total = runs.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);

    return { total, runs };
  });

  // GET /api/cost/task/:taskId/phases — Per-phase cost breakdown for complex tasks
  app.get("/api/cost/task/:taskId/phases", async (request: FastifyRequest<{ Params: { taskId: string } }>, reply: FastifyReply) => {
    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    const rows = await app.db.execute(sql`
      SELECT
        COALESCE(
          CASE WHEN trigger_detail LIKE 'phase:%'
            THEN SUBSTRING(trigger_detail FROM 7)
            ELSE 'unknown'
          END,
          'unknown'
        ) AS phase,
        COALESCE(SUM(cost_usd), 0)::float AS "totalCost",
        COUNT(*)::int AS "runCount"
      FROM heartbeat_runs
      WHERE task_id = ${request.params.taskId}
        AND project_id = ${projectId}
        AND cost_usd IS NOT NULL
      GROUP BY phase
      ORDER BY phase
    `);

    const byPhase = rows as unknown as Array<{ phase: string; totalCost: number; runCount: number }>;
    const total = byPhase.reduce((sum, row) => sum + Number(row.totalCost), 0);

    return { total, byPhase };
  });
}
