import type { FastifyInstance, FastifyReply } from "fastify";
import { projects } from "@orch/shared/db";
import { eq } from "drizzle-orm";
import { resolveProjectParam } from "../utils/project-resolver.js";
import { isUniqueViolation } from "../utils/db-errors.js";

async function loadProject(app: FastifyInstance, idOrSlug: string, reply: FastifyReply) {
  const projectId = await resolveProjectParam(app, idOrSlug, reply);
  if (!projectId) return null;
  const [project] = await app.db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project) {
    reply.status(404).send({ error: "Project not found" });
    return null;
  }

  return project;
}

export async function projectSkillRoutes(app: FastifyInstance) {
  // GET /api/projects/:projectId/skills
  app.get("/api/projects/:projectId/skills", async (request, reply) => {
    const { projectId: idOrSlug } = request.params as { projectId: string };
    const projectId = await resolveProjectParam(app, idOrSlug, reply);
    if (!projectId) return reply;
    const skills = await app.projectSkillService.list(projectId);
    return skills;
  });

  // POST /api/projects/:projectId/skills/sync
  // Must be registered BEFORE the :idOrSlug route to prevent "sync" from matching as a param
  app.post("/api/projects/:projectId/skills/sync", async (request, reply) => {
    const { projectId: idOrSlug } = request.params as { projectId: string };
    const project = await loadProject(app, idOrSlug, reply);
    if (!project) return reply;

    await app.projectSkillService.syncFromDisk(project.id, project.homeDir);
    const skills = await app.projectSkillService.list(project.id);
    return { synced: skills.length };
  });

  // GET /api/projects/:projectId/skills/:idOrSlug
  app.get("/api/projects/:projectId/skills/:idOrSlug", async (request, reply) => {
    const { projectId: projectIdOrSlug, idOrSlug } = request.params as { projectId: string; idOrSlug: string };
    const projectId = await resolveProjectParam(app, projectIdOrSlug, reply);
    if (!projectId) return reply;
    const skill = await app.projectSkillService.get(projectId, idOrSlug);
    if (!skill) return reply.status(404).send({ error: "Skill not found" });
    return skill;
  });

  // POST /api/projects/:projectId/skills
  app.post("/api/projects/:projectId/skills", async (request, reply) => {
    const { projectId: idOrSlug } = request.params as { projectId: string };
    const project = await loadProject(app, idOrSlug, reply);
    if (!project) return reply;
    const body = request.body as {
      slug?: string;
      sourceLocator?: string;
      name?: string;
      description?: string | null;
      markdown?: string;
      assignedAgentIds?: string[];
    };

    try {
      if (body.sourceLocator) {
        const skill = await app.projectSkillService.create(project.id, {
          slug: body.slug ?? "",
          sourceLocator: body.sourceLocator,
        });
        return reply.status(201).send(skill);
      }

      if (!body.name?.trim()) {
        return reply.status(400).send({ error: "validation_error", message: "name is required" });
      }

      const skill = await app.projectSkillService.createLocal(project.id, project.homeDir, {
        slug: body.slug,
        name: body.name,
        description: body.description,
        markdown: body.markdown,
        assignedAgentIds: body.assignedAgentIds,
      });
      return reply.status(201).send(skill);
    } catch (err) {
      if (isUniqueViolation(err) || (err as Error).message === "Skill already exists") {
        return reply.status(409).send({ error: "conflict", message: "Skill with this slug already exists" });
      }
      throw err;
    }
  });

  // PATCH /api/projects/:projectId/skills/:idOrSlug
  app.patch("/api/projects/:projectId/skills/:idOrSlug", async (request, reply) => {
    const { projectId: projectIdOrSlug, idOrSlug } = request.params as { projectId: string; idOrSlug: string };
    const project = await loadProject(app, projectIdOrSlug, reply);
    if (!project) return reply;
    const body = request.body as {
      name?: string;
      description?: string | null;
      markdown?: string;
      assignedAgentIds?: string[];
    };

    if (!body.name?.trim()) {
      return reply.status(400).send({ error: "validation_error", message: "name is required" });
    }

    try {
      const skill = await app.projectSkillService.update(project.id, project.homeDir, idOrSlug, {
        name: body.name,
        description: body.description,
        markdown: body.markdown,
        assignedAgentIds: body.assignedAgentIds,
      });
      return skill;
    } catch (err) {
      if ((err as Error).message === "Skill not found") {
        return reply.status(404).send({ error: "Skill not found" });
      }
      throw err;
    }
  });

  // DELETE /api/projects/:projectId/skills/:idOrSlug
  app.delete("/api/projects/:projectId/skills/:idOrSlug", async (request, reply) => {
    const { projectId: projectIdOrSlug, idOrSlug } = request.params as { projectId: string; idOrSlug: string };
    const projectId = await resolveProjectParam(app, projectIdOrSlug, reply);
    if (!projectId) return reply;

    const skill = await app.projectSkillService.get(projectId, idOrSlug);
    if (!skill) return reply.status(404).send({ error: "Skill not found" });

    if (skill.sourceType === "global") {
      return reply.status(403).send({
        error: "Cannot delete global skills. Create a project-local override instead.",
      });
    }

    const project = await loadProject(app, projectIdOrSlug, reply);
    if (!project) return reply;

    await app.projectSkillService.delete(projectId, idOrSlug, project.homeDir);
    return reply.status(204).send();
  });
}
