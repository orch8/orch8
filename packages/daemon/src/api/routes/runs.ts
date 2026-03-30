import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { heartbeatRuns } from "@orch/shared/db";
import "../../types.js";

export async function runRoutes(app: FastifyInstance) {
  // GET /api/runs — List runs
  app.get("/api/runs", async (request: FastifyRequest, reply: FastifyReply) => {
    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    const query = request.query as { agentId?: string; status?: string; taskId?: string; limit?: string };

    const conditions = [eq(heartbeatRuns.projectId, projectId)];
    if (query.agentId) conditions.push(eq(heartbeatRuns.agentId, query.agentId));
    if (query.status) conditions.push(eq(heartbeatRuns.status, query.status as typeof heartbeatRuns.status.enumValues[number]));
    if (query.taskId) conditions.push(eq(heartbeatRuns.taskId, query.taskId));

    const limit = Math.min(parseInt(query.limit ?? "100", 10), 500);

    const runs = await app.db
      .select()
      .from(heartbeatRuns)
      .where(and(...conditions))
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
}
