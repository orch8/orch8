import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { projects } from "@orch/shared/db";

// Augment FastifyInstance to include agentCreatorService
declare module "fastify" {
  interface FastifyInstance {
    agentCreatorService: import("../../services/agent-creator.service.js").AgentCreatorService;
  }
}

export async function agentCreatorRoutes(app: FastifyInstance) {
  const ac = app.agentCreatorService;

  // POST /api/agent-creator/:projectId/start
  app.post("/api/agent-creator/:projectId/start", async (
    request: FastifyRequest<{ Params: { projectId: string } }>,
    reply: FastifyReply,
  ) => {
    const { projectId } = request.params;
    request.log.info({ projectId }, "agent-creator route: start request");
    try {
      const [project] = await app.db.select().from(projects).where(eq(projects.id, projectId));
      const cwd = project?.homeDir ?? process.cwd();
      const sessionId = await ac.startSession(projectId, cwd);
      return { sessionId };
    } catch (err) {
      const msg = (err as Error).message;
      request.log.error({ projectId, err: msg }, "agent-creator route: start failed");
      if (msg.includes("already has an active")) {
        return reply.code(409).send({ error: "conflict", message: msg });
      }
      throw err;
    }
  });

  // POST /api/agent-creator/:sessionId/message
  app.post("/api/agent-creator/:sessionId/message", async (
    request: FastifyRequest<{ Params: { sessionId: string } }>,
    reply: FastifyReply,
  ) => {
    const { sessionId } = request.params;
    const body = request.body as { content?: string };
    if (!body.content) {
      return reply.code(400).send({ error: "validation_error", message: "content is required" });
    }

    try {
      await ac.sendMessage(sessionId, body.content);
      return { ok: true };
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("No active")) {
        return reply.code(404).send({ error: "not_found", message: msg });
      }
      throw err;
    }
  });

  // POST /api/agent-creator/:sessionId/confirm
  app.post("/api/agent-creator/:sessionId/confirm", async (
    request: FastifyRequest<{ Params: { sessionId: string } }>,
    reply: FastifyReply,
  ) => {
    const { sessionId } = request.params;
    try {
      const agent = await ac.confirmAgent(sessionId, app.agentService);
      return agent;
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("No active")) {
        return reply.code(404).send({ error: "not_found", message: msg });
      }
      if (msg.includes("No agent-config") || msg.includes("Validation") || (err as any)?.issues) {
        return reply.code(422).send({ error: "validation_error", message: msg });
      }
      if (msg.includes("duplicate") || msg.includes("unique")) {
        return reply.code(409).send({ error: "conflict", message: msg });
      }
      throw err;
    }
  });

  // POST /api/agent-creator/:sessionId/cancel
  app.post("/api/agent-creator/:sessionId/cancel", async (
    request: FastifyRequest<{ Params: { sessionId: string } }>,
    reply: FastifyReply,
  ) => {
    const { sessionId } = request.params;
    try {
      ac.cancelSession(sessionId);
      return { ok: true };
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("No active")) {
        return reply.code(404).send({ error: "not_found", message: msg });
      }
      throw err;
    }
  });
}
