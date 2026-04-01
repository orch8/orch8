import type { FastifyInstance } from "fastify";
import { projects } from "@orch/shared/db";
import { eq } from "drizzle-orm";

export async function projectSkillRoutes(app: FastifyInstance) {
  // GET /api/projects/:projectId/skills
  app.get("/api/projects/:projectId/skills", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const skills = await app.projectSkillService.list(projectId);
    return skills;
  });

  // POST /api/projects/:projectId/skills/sync
  // Must be registered BEFORE the :idOrSlug route to prevent "sync" from matching as a param
  app.post("/api/projects/:projectId/skills/sync", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const [project] = await app.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) return reply.status(404).send({ error: "Project not found" });

    await app.projectSkillService.syncFromDisk(projectId, project.homeDir);
    const skills = await app.projectSkillService.list(projectId);
    return { synced: skills.length };
  });

  // GET /api/projects/:projectId/skills/:idOrSlug
  app.get("/api/projects/:projectId/skills/:idOrSlug", async (request, reply) => {
    const { projectId, idOrSlug } = request.params as { projectId: string; idOrSlug: string };
    const skill = await app.projectSkillService.get(projectId, idOrSlug);
    if (!skill) return reply.status(404).send({ error: "Skill not found" });
    return skill;
  });

  // POST /api/projects/:projectId/skills
  app.post("/api/projects/:projectId/skills", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { slug, sourceLocator } = request.body as { slug: string; sourceLocator: string };
    const skill = await app.projectSkillService.create(projectId, { slug, sourceLocator });
    return reply.status(201).send(skill);
  });

  // DELETE /api/projects/:projectId/skills/:idOrSlug
  app.delete("/api/projects/:projectId/skills/:idOrSlug", async (request, reply) => {
    const { projectId, idOrSlug } = request.params as { projectId: string; idOrSlug: string };
    await app.projectSkillService.delete(projectId, idOrSlug);
    return reply.status(204).send();
  });
}
