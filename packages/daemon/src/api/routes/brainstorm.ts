import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { tasks, projects } from "@orch/shared/db";

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
    const { taskId } = request.params;
    request.log.info({ taskId }, "brainstorm route: start request");
    try {
      const project = await getProjectForTask(app, taskId);
      request.log.info({ taskId, homeDir: project?.homeDir }, "brainstorm route: resolved project");
      await bs.startSession(taskId, project?.homeDir ?? process.cwd());
      request.log.info({ taskId }, "brainstorm route: session started");
      return { ok: true };
    } catch (err) {
      const msg = (err as Error).message;
      request.log.error({ taskId, err: msg }, "brainstorm route: start failed");
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
    const { taskId } = request.params;
    const body = request.body as { content?: string };
    if (!body.content) {
      request.log.warn({ taskId }, "brainstorm route: message missing content");
      return reply.code(400).send({ error: "validation_error", message: "content is required" });
    }

    request.log.info({ taskId, contentLength: body.content.length }, "brainstorm route: message request");
    try {
      await bs.sendMessage(taskId, body.content);
      request.log.info({ taskId }, "brainstorm route: message sent");
      return { ok: true };
    } catch (err) {
      const msg = (err as Error).message;
      request.log.error({ taskId, err: msg }, "brainstorm route: message failed");
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
  const [task] = await app.db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) return null;

  const [project] = await app.db.select().from(projects).where(eq(projects.id, task.projectId));
  return project ?? null;
}
