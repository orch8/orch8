import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { EntityFilterSchema, KnowledgeSearchSchema, CreateFactSchema } from "@orch/shared";
import "../../types.js";

export async function memoryRoutes(app: FastifyInstance) {
  // GET /api/memory/knowledge — List entities
  app.get("/api/memory/knowledge", async (request: FastifyRequest) => {
    const parsed = EntityFilterSchema.safeParse(request.query);
    const filter = parsed.success ? parsed.data : {};
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
    if (!entity) {
      return reply.code(404).send({ error: "not_found", message: "Entity not found" });
    }
    return entity;
  });

  // GET /api/memory/knowledge/:id/facts — Full fact store (scored)
  app.get("/api/memory/knowledge/:id/facts", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const entity = await app.memoryService.getEntity(request.params.id);
    if (!entity) {
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
    if (!entity) {
      return reply.code(404).send({ error: "not_found", message: "Entity not found" });
    }

    // Memory scoping: auto-tag source_agent from authenticated agent
    const sourceAgent = request.agent?.id ?? "admin";

    const fact = await app.memoryService.writeFact(entity.id, parsed.data, sourceAgent);
    return reply.code(201).send(fact);
  });
}
