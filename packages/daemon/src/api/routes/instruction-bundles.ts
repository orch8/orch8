import type { FastifyInstance } from "fastify";

export async function instructionBundleRoutes(app: FastifyInstance) {
  // GET /api/agents/:id/instructions
  app.get("/api/agents/:id/instructions", async (request, reply) => {
    const { id } = request.params as { id: string };
    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }
    const bundle = await app.instructionBundleService.get(id, projectId);
    if (!bundle) return reply.status(404).send({ error: "No bundle found" });
    return bundle;
  });

  // PATCH /api/agents/:id/instructions
  app.patch("/api/agents/:id/instructions", async (request, reply) => {
    const { id } = request.params as { id: string };
    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }
    const body = request.body as { mode?: string; rootPath?: string; entryFile?: string };
    try {
      await app.instructionBundleService.updateMode(id, projectId, body as any);
      return { ok: true };
    } catch (err: any) {
      if (err.message?.includes("not found")) return reply.code(404).send({ error: err.message });
      throw err;
    }
  });

  // GET /api/agents/:id/instructions/files
  app.get("/api/agents/:id/instructions/files", async (request, reply) => {
    const { id } = request.params as { id: string };
    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }
    const files = await app.instructionBundleService.listFiles(id, projectId);
    return files;
  });

  // GET /api/agents/:id/instructions/files/:path
  app.get("/api/agents/:id/instructions/files/:path", async (request, reply) => {
    const { id, path } = request.params as { id: string; path: string };
    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }
    try {
      const content = await app.instructionBundleService.readFile(id, projectId, path);
      return { path, content };
    } catch (err: any) {
      if (err.message?.includes("not found")) return reply.code(404).send({ error: err.message });
      throw err;
    }
  });

  // PUT /api/agents/:id/instructions/files/:path
  app.put("/api/agents/:id/instructions/files/:path", async (request, reply) => {
    const { id, path } = request.params as { id: string; path: string };
    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }
    const { content } = request.body as { content: string };
    try {
      await app.instructionBundleService.writeFile(id, projectId, path, content);
      return { ok: true };
    } catch (err: any) {
      if (err.message?.includes("not found")) return reply.code(404).send({ error: err.message });
      if (err.message?.includes("external") || err.message?.includes("traversal")) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }
  });

  // DELETE /api/agents/:id/instructions/files/:path
  app.delete("/api/agents/:id/instructions/files/:path", async (request, reply) => {
    const { id, path } = request.params as { id: string; path: string };
    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }
    try {
      await app.instructionBundleService.deleteFile(id, projectId, path);
      return reply.status(204).send();
    } catch (err: any) {
      if (err.message?.includes("not found")) return reply.code(404).send({ error: err.message });
      if (err.message?.includes("external") || err.message?.includes("entry file") || err.message?.includes("traversal")) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }
  });
}
