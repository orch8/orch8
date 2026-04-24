import type { FastifyInstance, FastifyReply } from "fastify";

export async function resolveProjectParam(
  app: FastifyInstance,
  idOrSlug: string,
  reply: FastifyReply,
): Promise<string | null> {
  try {
    return await app.projectService.resolveProjectId(idOrSlug);
  } catch (err) {
    if ((err as Error).message === "Project not found") {
      reply.code(404).send({ error: "not_found", message: "Project not found" });
      return null;
    }
    throw err;
  }
}

export async function resolveProjectValue(
  app: FastifyInstance,
  idOrSlug?: string,
): Promise<string | undefined> {
  if (!idOrSlug) return undefined;
  try {
    return await app.projectService.resolveProjectId(idOrSlug);
  } catch (err) {
    if ((err as Error).message === "Project not found") {
      const notFound = new Error("Project not found") as Error & {
        statusCode?: number;
        code?: string;
      };
      notFound.statusCode = 404;
      notFound.code = "not_found";
      throw notFound;
    }
    throw err;
  }
}
