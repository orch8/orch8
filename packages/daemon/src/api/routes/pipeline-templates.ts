import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  CreatePipelineTemplateSchema,
  UpdatePipelineTemplateSchema,
  PipelineTemplateFilterSchema,
} from "@orch/shared";
import { resolveProjectParam, resolveProjectValue } from "../utils/project-resolver.js";

export async function pipelineTemplateRoutes(app: FastifyInstance) {
  // POST /api/pipeline-templates
  app.post("/api/pipeline-templates", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = CreatePipelineTemplateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
    }
    const projectId = await resolveProjectParam(app, parsed.data.projectId, reply);
    if (!projectId) return reply;
    const tpl = await app.pipelineTemplateService.create({ ...parsed.data, projectId });
    return reply.code(201).send(tpl);
  });

  // GET /api/pipeline-templates
  app.get("/api/pipeline-templates", async (request: FastifyRequest) => {
    const parsed = PipelineTemplateFilterSchema.safeParse(request.query);
    const filter = parsed.success ? parsed.data : {};
    if (filter.projectId) {
      filter.projectId = await resolveProjectValue(app, filter.projectId);
    }
    return app.pipelineTemplateService.list(filter);
  });

  // GET /api/pipeline-templates/:id
  app.get("/api/pipeline-templates/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tpl = await app.pipelineTemplateService.getById(request.params.id);
    if (!tpl) return reply.code(404).send({ error: "not_found", message: "Pipeline template not found" });
    return tpl;
  });

  // PATCH /api/pipeline-templates/:id
  app.patch("/api/pipeline-templates/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = UpdatePipelineTemplateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
    }
    try {
      const tpl = await app.pipelineTemplateService.update(request.params.id, parsed.data);
      return tpl;
    } catch (err) {
      if ((err as Error).message.includes("not found")) {
        return reply.code(404).send({ error: "not_found", message: "Pipeline template not found" });
      }
      throw err;
    }
  });

  // DELETE /api/pipeline-templates/:id
  app.delete("/api/pipeline-templates/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      await app.pipelineTemplateService.delete(request.params.id);
      return { ok: true };
    } catch (err) {
      if ((err as Error).message.includes("not found")) {
        return reply.code(404).send({ error: "not_found", message: "Pipeline template not found" });
      }
      throw err;
    }
  });
}
