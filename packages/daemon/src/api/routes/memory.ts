import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { EntityFilterSchema, KnowledgeSearchSchema, CreateFactSchema, CreateEntitySchema, SupersedeFactSchema, WorklogEntrySchema, LessonEntrySchema } from "@orch/shared";
import { eq, and } from "drizzle-orm";
import { agents, projects } from "@orch/shared/db";
import { isUniqueViolation } from "../utils/db-errors.js";
import "../../types.js";

export async function memoryRoutes(app: FastifyInstance) {
  // POST /api/memory/knowledge — Create entity
  app.post("/api/memory/knowledge", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = CreateEntitySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
    }

    if (!request.projectId) {
      return reply.code(400).send({ error: "bad_request", message: "projectId required" });
    }

    try {
      const entity = await app.memoryService.createEntity({
        ...parsed.data,
        projectId: request.projectId,
      });
      return reply.code(201).send(entity);
    } catch (err: unknown) {
      if (isUniqueViolation(err, "uniq_entity_project_slug")) {
        return reply.code(409).send({ error: "conflict", message: "Entity with this slug already exists in project" });
      }
      throw err;
    }
  });

  // GET /api/memory/knowledge — List entities
  app.get("/api/memory/knowledge", async (request: FastifyRequest) => {
    const parsed = EntityFilterSchema.safeParse(request.query);
    const filter = parsed.success ? parsed.data : {};
    // Always scope to authenticated project
    if (request.projectId) filter.projectId = request.projectId;
    return app.memoryService.listEntities(filter);
  });

  // GET /api/memory/knowledge/search — Full-text search (must be before :id)
  app.get("/api/memory/knowledge/search", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = KnowledgeSearchSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
    }
    return app.memoryService.searchFacts(parsed.data);
  });

  // GET /api/memory/knowledge/:id — Entity summary
  app.get("/api/memory/knowledge/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const entity = await app.memoryService.getEntity(request.params.id);
    if (!entity || (request.projectId && entity.projectId !== request.projectId)) {
      return reply.code(404).send({ error: "not_found", message: "Entity not found" });
    }
    return entity;
  });

  // GET /api/memory/knowledge/:id/facts — Full fact store (scored)
  app.get("/api/memory/knowledge/:id/facts", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const entity = await app.memoryService.getEntity(request.params.id);
    if (!entity || (request.projectId && entity.projectId !== request.projectId)) {
      return reply.code(404).send({ error: "not_found", message: "Entity not found" });
    }
    return app.memoryService.listFacts(entity.id);
  });

  // POST /api/memory/knowledge/:id/facts — Write fact (memory scoping: auto-tag sourceAgent)
  app.post("/api/memory/knowledge/:id/facts", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = CreateFactSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
    }

    const entity = await app.memoryService.getEntity(request.params.id);
    if (!entity || (request.projectId && entity.projectId !== request.projectId)) {
      return reply.code(404).send({ error: "not_found", message: "Entity not found" });
    }

    // Memory scoping: auto-tag source_agent from authenticated agent
    const sourceAgent = request.agent?.id ?? "admin";

    const fact = await app.memoryService.writeFact(entity.id, parsed.data, sourceAgent);
    return reply.code(201).send(fact);
  });

  // POST /api/memory/knowledge/:entityId/facts/:factId/supersede — Supersede a fact
  app.post("/api/memory/knowledge/:entityId/facts/:factId/supersede", async (
    request: FastifyRequest<{ Params: { entityId: string; factId: string } }>,
    reply: FastifyReply,
  ) => {
    const parsed = SupersedeFactSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
    }

    const entity = await app.memoryService.getEntity(request.params.entityId);
    if (!entity || (request.projectId && entity.projectId !== request.projectId)) {
      return reply.code(404).send({ error: "not_found", message: "Entity not found" });
    }

    const sourceAgent = request.agent?.id ?? "admin";

    try {
      const result = await app.memoryService.supersedeFact(
        request.params.factId,
        parsed.data,
        sourceAgent,
      );
      return reply.code(201).send(result);
    } catch (err: unknown) {
      const msg = (err as Error).message;
      if (msg === "fact_not_found") {
        return reply.code(404).send({ error: "not_found", message: "Fact not found" });
      }
      if (msg === "already_superseded") {
        return reply.code(409).send({ error: "conflict", message: "Fact already superseded" });
      }
      throw err;
    }
  });

  // POST /api/memory/knowledge/:id/summarize — Trigger summary regeneration for an entity
  app.post("/api/memory/knowledge/:id/summarize", async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const entity = await app.memoryService.getEntity(request.params.id);
    if (!entity || (request.projectId && entity.projectId !== request.projectId)) {
      return reply.code(404).send({ error: "not_found", message: "Entity not found" });
    }

    // Resolve project homeDir for summary path
    const [project] = await app.db
      .select()
      .from(projects)
      .where(eq(projects.id, entity.projectId));
    if (!project) {
      return reply.code(404).send({ error: "not_found", message: "Project not found" });
    }

    const summaryDir = `${project.homeDir}/.orch8/memory/summaries`;
    const result = await app.summaryService.generateEntitySummary(entity.id, summaryDir);
    return reply.code(200).send(result);
  });

  // ─── Worklog ────────────────────────────────────

  // GET /api/memory/worklog — Read work log entries
  app.get("/api/memory/worklog", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { agentId?: string };
    const agentId = query.agentId ?? request.agent?.id;
    if (!agentId || !request.projectId) {
      return reply.code(400).send({ error: "validation_error", message: "agentId and projectId required" });
    }

    const agent = await getAgentWithPaths(app, agentId, request.projectId);
    if (!agent?.workLogDir) {
      return { entries: [] };
    }

    const entries = await app.memoryService.readWorklog(agent.workLogDir);
    return { entries };
  });

  // POST /api/memory/worklog — Append to work log (own agent only)
  app.post("/api/memory/worklog", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = WorklogEntrySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
    }

    // Memory scoping §5: agent can only append to its own work log
    const agent = request.agent;
    if (!agent && !request.isAdmin) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    if (!agent && (!request.projectId || !(request.body as any)?.agentId)) {
      return reply.code(400).send({ error: "bad_request", message: "agentId and projectId required for admin worklog write" });
    }

    const targetAgent = agent ?? await getAgentWithPaths(app, (request.body as any)?.agentId, request.projectId!);
    if (!targetAgent?.workLogDir) {
      return reply.code(400).send({ error: "bad_request", message: "Agent has no workLogDir configured" });
    }

    const filename = await app.memoryService.appendWorklog(targetAgent.workLogDir, parsed.data.content);
    return reply.code(201).send({ ok: true, filename });
  });

  // ─── Lessons ────────────────────────────────────

  // GET /api/memory/lessons — Read lessons file
  app.get("/api/memory/lessons", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { agentId?: string };
    const agentId = query.agentId ?? request.agent?.id;
    if (!agentId || !request.projectId) {
      return reply.code(400).send({ error: "validation_error", message: "agentId and projectId required" });
    }

    const agent = await getAgentWithPaths(app, agentId, request.projectId);
    if (!agent?.lessonsFile) {
      return { content: "" };
    }

    const content = await app.memoryService.readLessons(agent.lessonsFile);
    return { content };
  });

  // POST /api/memory/lessons — Append to lessons file (own agent only)
  app.post("/api/memory/lessons", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = LessonEntrySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
    }

    // Memory scoping §5: agent can only append to its own lessons
    const agent = request.agent;
    if (!agent && !request.isAdmin) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    if (!agent && (!request.projectId || !(request.body as any)?.agentId)) {
      return reply.code(400).send({ error: "bad_request", message: "agentId and projectId required for admin lesson write" });
    }

    const targetAgent = agent ?? await getAgentWithPaths(app, (request.body as any)?.agentId, request.projectId!);
    if (!targetAgent?.lessonsFile) {
      return reply.code(400).send({ error: "bad_request", message: "Agent has no lessonsFile configured" });
    }

    await app.memoryService.appendLesson(targetAgent.lessonsFile, parsed.data.content);
    return reply.code(201).send({ ok: true });
  });
}

async function getAgentWithPaths(app: FastifyInstance, agentId: string, projectId: string) {
  const [agent] = await app.db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)));
  return agent ?? null;
}
