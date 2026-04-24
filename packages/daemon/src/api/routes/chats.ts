import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  CreateChatSchema,
  UpdateChatSchema,
  SendChatMessageSchema,
  CardDecisionSchema,
} from "@orch/shared";
import "../../types.js";

export async function chatsRoutes(app: FastifyInstance) {
  // ─── Chats ─────────────────────────────────────────────

  // GET /api/projects/:projectId/chats — list
  app.get(
    "/api/projects/:projectId/chats",
    async (
      request: FastifyRequest<{
        Params: { projectId: string };
        Querystring: { includeArchived?: string };
      }>,
    ) => {
      const includeArchived = request.query.includeArchived === "true";
      return app.chatService.listChats(request.params.projectId, { includeArchived });
    },
  );

  // POST /api/projects/:projectId/chats — create
  app.post(
    "/api/projects/:projectId/chats",
    async (
      request: FastifyRequest<{ Params: { projectId: string } }>,
      reply: FastifyReply,
    ) => {
      const parsed = CreateChatSchema.safeParse({
        ...(typeof request.body === "object" && request.body !== null ? request.body : {}),
        projectId: request.params.projectId,
      });
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation_error", details: parsed.error.issues });
      }

      // Default the agentId to the project's chat agent if not provided.
      let agentId = parsed.data.agentId;
      if (!agentId) {
        agentId = "chat";
      }

      try {
        const chat = await app.chatService.createChat({
          projectId: parsed.data.projectId,
          agentId,
          title: parsed.data.title,
          seedMessage: parsed.data.seedMessage,
        });
        return reply.code(201).send(chat);
      } catch (err) {
        const message = (err as Error).message;
        return reply.code(400).send({ error: "create_failed", message });
      }
    },
  );

  // GET /api/chats/:chatId — get
  app.get(
    "/api/chats/:chatId",
    async (
      request: FastifyRequest<{ Params: { chatId: string } }>,
      reply: FastifyReply,
    ) => {
      const chat = await app.chatService.getChat(request.params.chatId);
      if (!chat) return reply.code(404).send({ error: "not_found" });
      return chat;
    },
  );

  // PATCH /api/chats/:chatId — update
  app.patch(
    "/api/chats/:chatId",
    async (
      request: FastifyRequest<{ Params: { chatId: string } }>,
      reply: FastifyReply,
    ) => {
      const parsed = UpdateChatSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation_error", details: parsed.error.issues });
      }

      try {
        return await app.chatService.updateChat(request.params.chatId, parsed.data);
      } catch (err) {
        if ((err as Error).message === "Chat not found") {
          return reply.code(404).send({ error: "not_found" });
        }
        throw err;
      }
    },
  );

  // DELETE /api/chats/:chatId — soft delete
  app.delete(
    "/api/chats/:chatId",
    async (
      request: FastifyRequest<{ Params: { chatId: string } }>,
      reply: FastifyReply,
    ) => {
      await app.chatService.deleteChat(request.params.chatId);
      return reply.code(204).send();
    },
  );

  // ─── Messages ──────────────────────────────────────────

  // GET /api/chats/:chatId/messages — list
  app.get(
    "/api/chats/:chatId/messages",
    async (
      request: FastifyRequest<{
        Params: { chatId: string };
        Querystring: { limit?: string; before?: string };
      }>,
    ) => {
      const limit = request.query.limit ? Number(request.query.limit) : undefined;
      const before = request.query.before;
      return app.chatService.listMessages(request.params.chatId, { limit, before });
    },
  );

  // POST /api/chats/:chatId/messages — send
  app.post(
    "/api/chats/:chatId/messages",
    async (
      request: FastifyRequest<{ Params: { chatId: string } }>,
      reply: FastifyReply,
    ) => {
      const parsed = SendChatMessageSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation_error", details: parsed.error.issues });
      }
      try {
        const msg = await app.chatService.sendUserMessage(
          request.params.chatId,
          parsed.data.content,
        );
        return reply.code(202).send(msg); // 202: accepted, assistant run spawning
      } catch (err) {
        const message = (err as Error).message;
        if (message === "Chat not found") return reply.code(404).send({ error: "not_found" });
        if (message === "Chat is archived") {
          return reply.code(409).send({ error: "archived", message });
        }
        throw err;
      }
    },
  );

  // POST /api/chats/:chatId/cards/:cardId/decision
  app.post(
    "/api/chats/:chatId/cards/:cardId/decision",
    async (
      request: FastifyRequest<{
        Params: { chatId: string; cardId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const parsed = CardDecisionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation_error", details: parsed.error.issues });
      }
      // Project scoping is required — decideCard mutates chat state,
      // so we must know which project the caller is acting in to
      // prevent cross-project approval of cards (issue 2.5).
      const projectId = request.projectId;
      if (!projectId) {
        return reply
          .code(400)
          .send({ error: "project_required", message: "project scope is required" });
      }
      try {
        const updated = await app.chatService.decideCard(
          request.params.chatId,
          request.params.cardId,
          parsed.data.decision,
          parsed.data.actor ?? "user",
          projectId,
        );
        return updated;
      } catch (err) {
        const message = (err as Error).message;
        if (message === "Chat not found") return reply.code(404).send({ error: "not_found" });
        if (message.startsWith("Card not found")) {
          return reply.code(404).send({ error: "card_not_found" });
        }
        throw err;
      }
    },
  );
}
