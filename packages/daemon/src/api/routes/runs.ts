import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, and, desc, inArray } from "drizzle-orm";
import { heartbeatRuns } from "@orch/shared/db";
import "../../types.js";

export async function runRoutes(app: FastifyInstance) {
  // GET /api/runs — List runs
  app.get("/api/runs", async (request: FastifyRequest, reply: FastifyReply) => {
    const projectId = request.projectId;

    // Agents must have a projectId; admins can omit it for cross-project view
    if (request.agent && !projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    const params = request.query as { agentId?: string; status?: string; taskId?: string; limit?: string };

    const conditions = [];
    if (projectId) conditions.push(eq(heartbeatRuns.projectId, projectId));
    if (params.agentId) conditions.push(eq(heartbeatRuns.agentId, params.agentId));
    if (params.status) conditions.push(eq(heartbeatRuns.status, params.status as typeof heartbeatRuns.status.enumValues[number]));
    if (params.taskId) conditions.push(eq(heartbeatRuns.taskId, params.taskId));

    const limit = Math.min(parseInt(params.limit ?? "100", 10), 500);

    let query = app.db
      .select()
      .from(heartbeatRuns);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const runs = await query
      .orderBy(desc(heartbeatRuns.createdAt))
      .limit(limit);

    return runs;
  });

  // GET /api/runs/:id — Get single run
  app.get("/api/runs/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    const [run] = await app.db
      .select()
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.id, request.params.id),
          eq(heartbeatRuns.projectId, projectId),
        ),
      );

    if (!run) {
      return reply.code(404).send({ error: "not_found", message: "Run not found" });
    }

    return run;
  });

  // POST /api/runs/:id/cancel — Cancel a queued or running run
  app.post("/api/runs/:id/cancel", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    // Atomic conditional update to avoid race with scheduler
    const [updated] = await app.db
      .update(heartbeatRuns)
      .set({ status: "cancelled", finishedAt: new Date() })
      .where(
        and(
          eq(heartbeatRuns.id, request.params.id),
          eq(heartbeatRuns.projectId, projectId),
          inArray(heartbeatRuns.status, ["queued", "running"]),
        ),
      )
      .returning();

    if (updated) {
      return updated;
    }

    // Distinguish 404 vs 409
    const [existing] = await app.db
      .select({ status: heartbeatRuns.status })
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.id, request.params.id),
          eq(heartbeatRuns.projectId, projectId),
        ),
      );

    if (!existing) {
      return reply.code(404).send({ error: "not_found", message: "Run not found" });
    }

    return reply.code(409).send({
      error: "conflict",
      message: `Cannot cancel run with status '${existing.status}'`,
    });
  });

  // GET /api/runs/:id/log — Get run log content
  app.get("/api/runs/:id/log", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    const [run] = await app.db
      .select({ logStore: heartbeatRuns.logStore, logRef: heartbeatRuns.logRef })
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.id, request.params.id),
          eq(heartbeatRuns.projectId, projectId),
        ),
      );

    if (!run || !run.logRef) {
      return reply.code(404).send({ error: "not_found", message: "No log found for this run" });
    }

    return { log: run.logRef, store: run.logStore };
  });
}
