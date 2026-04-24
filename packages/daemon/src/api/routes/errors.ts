import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { and, count, desc, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import { errorLog } from "@orch/shared/db";
import {
  CreateClientErrorLogSchema,
  ErrorLogFilterSchema,
  ResolveErrorLogSchema,
} from "@orch/shared";
import { resolveProjectValue } from "../utils/project-resolver.js";
import "../../types.js";

async function projectScopeFor(app: FastifyInstance, request: FastifyRequest, queryProjectId?: string) {
  if (request.agent) return request.projectId;
  return await resolveProjectValue(app, queryProjectId) ?? request.projectId;
}

function requireAgentProject(
  request: FastifyRequest,
  reply: FastifyReply,
  projectId?: string,
) {
  if (request.agent && !projectId) {
    reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    return false;
  }
  return true;
}

function normalizeFingerprintMessage(message: string) {
  return message
    .replace(/[a-z]+_[0-9a-f-]+/gi, "ID")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "ID")
    .replace(/\d{4}-\d{2}-\d{2}(?:t\d{2}:\d{2}:\d{2}(?:\.\d+)?z?)?/gi, "DATE")
    .replace(/\d+/g, "N")
    .replace(/\s+/g, " ")
    .trim();
}

function fingerprint(input: {
  source: string;
  code: string;
  message: string;
  runId?: string | null;
  taskId?: string | null;
}) {
  const basis = [
    input.source,
    input.code,
    normalizeFingerprintMessage(input.message),
    input.runId ?? input.taskId ?? "",
  ].join("|");
  return createHash("sha1").update(basis).digest("hex");
}

function clientCode(rawCode: string) {
  const suffix = rawCode
    .replace(/^client[._-]?/i, "")
    .replace(/[^a-z0-9_.-]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return `client_${suffix || "error"}`;
}

function applyFilters(filter: ReturnType<typeof ErrorLogFilterSchema.parse>, projectId?: string) {
  const conditions: SQL[] = [];
  if (projectId) conditions.push(eq(errorLog.projectId, projectId));
  if (filter.severity) conditions.push(eq(errorLog.severity, filter.severity));
  if (filter.source) conditions.push(eq(errorLog.source, filter.source));
  if (filter.code) conditions.push(eq(errorLog.code, filter.code));
  if (filter.agentId) conditions.push(eq(errorLog.agentId, filter.agentId));
  if (filter.taskId) conditions.push(eq(errorLog.taskId, filter.taskId));
  if (filter.runId) conditions.push(eq(errorLog.runId, filter.runId));
  if (filter.chatId) conditions.push(eq(errorLog.chatId, filter.chatId));
  if (filter.requestId) conditions.push(eq(errorLog.requestId, filter.requestId));
  if (filter.unresolvedOnly) conditions.push(isNull(errorLog.resolvedAt));
  if (filter.from) conditions.push(gte(errorLog.lastSeenAt, filter.from));
  if (filter.to) conditions.push(lte(errorLog.lastSeenAt, filter.to));
  return conditions;
}

export async function errorRoutes(app: FastifyInstance) {
  // GET /api/errors — List error logs
  app.get("/api/errors", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = ErrorLogFilterSchema.safeParse(request.query);
    const filter = parsed.success ? parsed.data : { limit: 100, offset: 0 };
    const projectId = await projectScopeFor(app, request, filter.projectId);

    if (!requireAgentProject(request, reply, projectId)) return reply;

    const conditions = applyFilters(filter, projectId);
    let query = app.db.select().from(errorLog);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    return query
      .orderBy(desc(errorLog.lastSeenAt))
      .limit(filter.limit)
      .offset(filter.offset);
  });

  // GET /api/errors/summary — Aggregate counts by source and severity
  app.get("/api/errors/summary", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = ErrorLogFilterSchema.safeParse(request.query);
    const filter = parsed.success ? parsed.data : { limit: 100, offset: 0 };
    const projectId = await projectScopeFor(app, request, filter.projectId);

    if (!requireAgentProject(request, reply, projectId)) return reply;

    const conditions = applyFilters(filter, projectId);
    let query = app.db
      .select({
        source: errorLog.source,
        severity: errorLog.severity,
        count: count(),
      })
      .from(errorLog);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const rows = await query.groupBy(errorLog.source, errorLog.severity);
    return rows.map((row) => ({ ...row, count: Number(row.count) }));
  });

  // GET /api/errors/:id — Get a single error log
  app.get(
    "/api/errors/:id",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const projectId = await projectScopeFor(app, request);

      if (!requireAgentProject(request, reply, projectId)) return reply;

      const conditions: SQL[] = [eq(errorLog.id, request.params.id)];
      if (projectId) conditions.push(eq(errorLog.projectId, projectId));

      const [row] = await app.db
        .select()
        .from(errorLog)
        .where(and(...conditions));

      if (!row) {
        return reply.code(404).send({ error: "not_found", message: "Error log not found" });
      }

      return row;
    },
  );

  // PATCH /api/errors/:id/resolve — Mark an error log resolved
  app.patch(
    "/api/errors/:id/resolve",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const projectId = await projectScopeFor(app, request);

      if (!requireAgentProject(request, reply, projectId)) return reply;

      const parsed = ResolveErrorLogSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
      }

      const conditions: SQL[] = [eq(errorLog.id, request.params.id)];
      if (projectId) conditions.push(eq(errorLog.projectId, projectId));

      const [row] = await app.db
        .update(errorLog)
        .set({ resolvedAt: new Date(), resolvedBy: parsed.data.resolvedBy })
        .where(and(...conditions))
        .returning();

      if (!row) {
        return reply.code(404).send({ error: "not_found", message: "Error log not found" });
      }

      return row;
    },
  );

  // POST /api/errors/client — Client-side self-report endpoint
  app.post("/api/errors/client", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = CreateClientErrorLogSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
    }

    const projectId = await projectScopeFor(app, request, parsed.data.projectId);
    if (!requireAgentProject(request, reply, projectId)) return reply;

    const code = clientCode(parsed.data.code);
    const message = parsed.data.message.slice(0, 2048);
    const now = new Date();
    const runId = parsed.data.runId ?? request.runId ?? null;
    const taskId = parsed.data.taskId ?? null;
    const agentId = request.agent?.id ?? parsed.data.agentId ?? null;

    const [row] = await app.db
      .insert(errorLog)
      .values({
        projectId: projectId ?? null,
        agentId,
        taskId,
        runId,
        chatId: parsed.data.chatId ?? null,
        requestId: parsed.data.requestId ?? request.id,
        severity: "warn",
        source: "api",
        code,
        message,
        metadata: parsed.data.metadata ?? {},
        httpMethod: parsed.data.httpMethod ?? null,
        httpPath: parsed.data.httpPath ?? null,
        httpStatus: parsed.data.httpStatus ?? null,
        actorType: request.agent ? "agent" : request.isAdmin ? "admin" : "system",
        actorId: request.agent?.id ?? null,
        fingerprint: fingerprint({ source: "api", code, message, runId, taskId }),
        firstSeenAt: now,
        lastSeenAt: now,
        occurredAt: now,
      })
      .onConflictDoUpdate({
        target: [errorLog.projectId, errorLog.fingerprint],
        set: {
          occurrences: sql`${errorLog.occurrences} + 1`,
          lastSeenAt: now,
          resolvedAt: null,
          resolvedBy: null,
          message,
          metadata: parsed.data.metadata ?? {},
        },
      })
      .returning();

    return reply.code(201).send(row);
  });
}
