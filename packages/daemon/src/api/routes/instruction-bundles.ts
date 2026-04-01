import type { FastifyInstance } from "fastify";

export async function instructionBundleRoutes(app: FastifyInstance) {
  // GET /api/agents/:id/instructions
  app.get("/api/agents/:id/instructions", async (request, reply) => {
    const { id } = request.params as { id: string };
    const projectId = (request.headers["x-project-id"] ?? request.projectId) as string;
    const bundle = await app.instructionBundleService.get(id, projectId);
    if (!bundle) return reply.status(404).send({ error: "No bundle found" });
    return bundle;
  });

  // PATCH /api/agents/:id/instructions
  app.patch("/api/agents/:id/instructions", async (request, reply) => {
    const { id } = request.params as { id: string };
    const projectId = (request.headers["x-project-id"] ?? request.projectId) as string;
    const body = request.body as { mode?: string; rootPath?: string; entryFile?: string };
    await app.instructionBundleService.updateMode(id, projectId, body as any);
    return { ok: true };
  });

  // GET /api/agents/:id/instructions/files
  app.get("/api/agents/:id/instructions/files", async (request, reply) => {
    const { id } = request.params as { id: string };
    const projectId = (request.headers["x-project-id"] ?? request.projectId) as string;
    const files = await app.instructionBundleService.listFiles(id, projectId);
    return files;
  });

  // GET /api/agents/:id/instructions/files/:path
  app.get("/api/agents/:id/instructions/files/:path", async (request, reply) => {
    const { id, path } = request.params as { id: string; path: string };
    const projectId = (request.headers["x-project-id"] ?? request.projectId) as string;
    const content = await app.instructionBundleService.readFile(id, projectId, path);
    return { path, content };
  });

  // PUT /api/agents/:id/instructions/files/:path
  app.put("/api/agents/:id/instructions/files/:path", async (request, reply) => {
    const { id, path } = request.params as { id: string; path: string };
    const projectId = (request.headers["x-project-id"] ?? request.projectId) as string;
    const { content } = request.body as { content: string };
    await app.instructionBundleService.writeFile(id, projectId, path, content);
    return { ok: true };
  });

  // DELETE /api/agents/:id/instructions/files/:path
  app.delete("/api/agents/:id/instructions/files/:path", async (request, reply) => {
    const { id, path } = request.params as { id: string; path: string };
    const projectId = (request.headers["x-project-id"] ?? request.projectId) as string;
    await app.instructionBundleService.deleteFile(id, projectId, path);
    return reply.status(204).send();
  });
}
