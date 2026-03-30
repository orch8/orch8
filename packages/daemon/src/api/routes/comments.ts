import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { CreateCommentSchema, CommentFilterSchema } from "@orch/shared";
import { CommentService } from "../../services/comment.service.js";

export async function commentRoutes(app: FastifyInstance) {
  const commentService = new CommentService(app.db);

  // POST /api/tasks/:taskId/comments — Create comment
  app.post(
    "/api/tasks/:taskId/comments",
    async (request: FastifyRequest<{ Params: { taskId: string } }>, reply: FastifyReply) => {
      const payload = request.body as Record<string, unknown>;
      const parsed = CreateCommentSchema.safeParse({
        ...payload,
        taskId: request.params.taskId,
      });

      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation_error",
          details: parsed.error.issues,
        });
      }

      const comment = await commentService.create(parsed.data);
      return reply.code(201).send(comment);
    },
  );

  // GET /api/tasks/:taskId/comments — List comments
  app.get(
    "/api/tasks/:taskId/comments",
    async (request: FastifyRequest<{ Params: { taskId: string }; Querystring: { type?: string } }>) => {
      const filter = CommentFilterSchema.safeParse(request.query);
      return commentService.listByTask(
        request.params.taskId,
        filter.success ? { type: filter.data.type } : undefined,
      );
    },
  );

  // DELETE /api/comments/:id — Delete comment
  app.delete(
    "/api/comments/:id",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await commentService.delete(request.params.id);
        return { ok: true };
      } catch (err) {
        if ((err as Error).message === "Comment not found") {
          return reply.code(404).send({ error: "not_found", message: "Comment not found" });
        }
        throw err;
      }
    },
  );
}
