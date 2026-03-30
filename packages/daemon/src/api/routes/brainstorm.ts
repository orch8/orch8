import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

// Augment FastifyInstance to include brainstormService
declare module "fastify" {
  interface FastifyInstance {
    brainstormService: import("../../services/brainstorm.service.js").BrainstormService;
  }
}

export async function brainstormRoutes(app: FastifyInstance) {
  const bs = app.brainstormService;

  // POST /api/brainstorm/:taskId/start
  app.post("/api/brainstorm/:taskId/start", async (
    request: FastifyRequest<{ Params: { taskId: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      const project = await getProjectForTask(app, request.params.taskId);
      await bs.startSession(request.params.taskId, project?.homeDir ?? process.cwd());
      return { ok: true };
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("already has an active session")) {
        return reply.code(409).send({ error: "conflict", message: msg });
      }
      if (msg.includes("not found")) {
        return reply.code(404).send({ error: "not_found", message: msg });
      }
      throw err;
    }
  });

  // POST /api/brainstorm/:taskId/message
  app.post("/api/brainstorm/:taskId/message", async (
    request: FastifyRequest<{ Params: { taskId: string } }>,
    reply: FastifyReply,
  ) => {
    const body = request.body as { content?: string };
    if (!body.content) {
      return reply.code(400).send({ error: "validation_error", message: "content is required" });
    }

    try {
      await bs.sendMessage(request.params.taskId, body.content);
      return { ok: true };
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("No active")) {
        return reply.code(404).send({ error: "not_found", message: msg });
      }
      throw err;
    }
  });

  // POST /api/brainstorm/:taskId/ready
  app.post("/api/brainstorm/:taskId/ready", async (
    request: FastifyRequest<{ Params: { taskId: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      await bs.markReady(request.params.taskId);
      return { ok: true };
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("No active")) {
        return reply.code(404).send({ error: "not_found", message: msg });
      }
      throw err;
    }
  });

  // POST /api/brainstorm/:taskId/kill
  app.post("/api/brainstorm/:taskId/kill", async (
    request: FastifyRequest<{ Params: { taskId: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      await bs.killSession(request.params.taskId);
      return { ok: true };
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("No active")) {
        return reply.code(404).send({ error: "not_found", message: msg });
      }
      throw err;
    }
  });

  // GET /api/brainstorm/:taskId/transcript
  app.get("/api/brainstorm/:taskId/transcript", async (
    request: FastifyRequest<{ Params: { taskId: string } }>,
    reply: FastifyReply,
  ) => {
    const transcript = await bs.getTranscript(request.params.taskId);
    if (transcript === null) {
      return reply.code(404).send({ error: "not_found", message: "No transcript found" });
    }
    return { transcript };
  });
}

async function getProjectForTask(app: FastifyInstance, taskId: string) {
  const { tasks, projects } = await import("@orch/shared/db");
  const { eq } = await import("drizzle-orm");

  const [task] = await app.db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) return null;

  const [project] = await app.db.select().from(projects).where(eq(projects.id, task.projectId));
  return project ?? null;
}
