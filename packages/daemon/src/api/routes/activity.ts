import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { activityLog } from "@orch/shared/db";
import { CreateLogEntrySchema, LogFilterSchema } from "@orch/shared";
import { resolveProjectValue } from "../utils/project-resolver.js";
import "../../types.js";

export async function activityRoutes(app: FastifyInstance) {
  // GET /api/log — Paginated activity log
  app.get("/api/log", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = LogFilterSchema.safeParse(request.query);
    const filter = parsed.success ? parsed.data : { limit: 100, offset: 0 };
    const projectId = await resolveProjectValue(app, filter.projectId) ?? request.projectId;

    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    const conditions = [eq(activityLog.projectId, projectId)];
    if (filter.agentId) conditions.push(eq(activityLog.agentId, filter.agentId));
    if (filter.taskId) conditions.push(eq(activityLog.taskId, filter.taskId));
    if (filter.level) conditions.push(eq(activityLog.level, filter.level));

    const entries = await app.db
      .select()
      .from(activityLog)
      .where(and(...conditions))
      .orderBy(desc(activityLog.createdAt))
      .limit(filter.limit ?? 100)
      .offset(filter.offset ?? 0);

    return entries;
  });

  // POST /api/log — Append log entry
  app.post("/api/log", async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = request.body as Record<string, unknown>;

    // Auto-fill agentId and runId from auth context
    const enriched = {
      ...payload,
      agentId: payload.agentId ?? request.agent?.id ?? undefined,
      runId: payload.runId ?? request.runId ?? undefined,
    };

    const parsed = CreateLogEntrySchema.safeParse(enriched);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
    }

    const projectId = await resolveProjectValue(app, parsed.data.projectId);
    const [entry] = await app.db.insert(activityLog).values({
      projectId: projectId!,
      agentId: parsed.data.agentId ?? null,
      taskId: parsed.data.taskId ?? null,
      runId: parsed.data.runId ?? null,
      message: parsed.data.message,
      level: parsed.data.level,
    }).returning();

    app.broadcastService.activityNew(entry.projectId, {
      id: entry.id,
      level: entry.level,
      agentId: entry.agentId,
      taskId: entry.taskId,
      message: entry.message,
      timestamp: entry.createdAt.toISOString(),
    });

    return reply.code(201).send(entry);
  });
}
