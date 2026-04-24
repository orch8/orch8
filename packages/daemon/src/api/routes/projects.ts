import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { CreateProjectSchema, UpdateProjectSchema, ProjectFilterSchema } from "@orch/shared";
import { isUniqueViolation } from "../utils/db-errors.js";
import { resolveProjectParam } from "../utils/project-resolver.js";
import "../../types.js";

export async function projectRoutes(app: FastifyInstance) {
  // POST /api/projects — Create project (admin only)
  app.post("/api/projects", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.isAdmin) {
      return reply.code(403).send({ error: "forbidden", message: "Admin only" });
    }

    const parsed = CreateProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
    }

    try {
      const project = await app.projectService.create(parsed.data);
      return reply.code(201).send(project);
    } catch (err) {
      if (isUniqueViolation(err, "projects_key_unique")) {
        return reply.code(409).send({ error: "conflict", message: "Project key already in use, pick another" });
      }
      if (isUniqueViolation(err, "projects_slug_unique") || isUniqueViolation(err)) {
        return reply.code(409).send({ error: "conflict", message: "Project with this slug already exists" });
      }
      if ((err as Error).message.includes("Project key")) {
        return reply.code(400).send({ error: "validation_error", message: (err as Error).message });
      }
      throw err;
    }
  });

  // GET /api/projects — List projects
  app.get("/api/projects", async (request: FastifyRequest) => {
    const parsed = ProjectFilterSchema.safeParse(request.query);
    const filter = parsed.success ? parsed.data : {};
    return app.projectService.list(filter);
  });

  // GET /api/projects/:id — Get project
  app.get("/api/projects/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const projectId = await resolveProjectParam(app, request.params.id, reply);
    if (!projectId) return reply;
    const project = await app.projectService.getById(projectId);
    if (!project) {
      return reply.code(404).send({ error: "not_found", message: "Project not found" });
    }
    return project;
  });

  // PATCH /api/projects/:id — Update project (admin only)
  app.patch("/api/projects/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (!request.isAdmin) {
      return reply.code(403).send({ error: "forbidden", message: "Admin only" });
    }

    const parsed = UpdateProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
    }

    try {
      const projectId = await resolveProjectParam(app, request.params.id, reply);
      if (!projectId) return reply;
      const project = await app.projectService.update(projectId, parsed.data);
      return project;
    } catch (err) {
      if ((err as Error).message === "Project not found") {
        return reply.code(404).send({ error: "not_found", message: "Project not found" });
      }
      throw err;
    }
  });

  // POST /api/projects/:id/archive — Archive project (admin only)
  app.post("/api/projects/:id/archive", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (!request.isAdmin) {
      return reply.code(403).send({ error: "forbidden", message: "Admin only" });
    }

    try {
      const projectId = await resolveProjectParam(app, request.params.id, reply);
      if (!projectId) return reply;
      const project = await app.projectService.archive(projectId);
      return project;
    } catch (err) {
      if ((err as Error).message === "Project not found") {
        return reply.code(404).send({ error: "not_found", message: "Project not found" });
      }
      throw err;
    }
  });
}
