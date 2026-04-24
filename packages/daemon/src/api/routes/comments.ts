import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import { CreateCommentSchema, CommentFilterSchema, extractMentionSlugs } from "@orch/shared";
import { agents, tasks } from "@orch/shared/db";
import { CommentService } from "../../services/comment.service.js";

export async function commentRoutes(app: FastifyInstance) {
  const commentService = app.hasDecorator("commentService")
    ? app.commentService
    : new CommentService(app.db);

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

      const mentionedSlugs = extractMentionSlugs(parsed.data.body);
      const mentionedAgentIds = mentionedSlugs.length > 0
        ? await resolveMentionedAgentIds(app, request.params.taskId, mentionedSlugs)
        : [];

      const comment = await commentService.create({
        ...parsed.data,
        mentions: mentionedAgentIds,
      });
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

async function resolveMentionedAgentIds(
  app: FastifyInstance,
  taskId: string,
  slugs: string[],
): Promise<string[]> {
  const [task] = await app.db
    .select({ projectId: tasks.projectId })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!task) return [];

  const rows = await app.db
    .select({ id: agents.id })
    .from(agents)
    .where(and(
      eq(agents.projectId, task.projectId),
      inArray(agents.id, slugs),
    ));

  const found = new Set(rows.map((row) => row.id));
  return slugs.filter((slug) => found.has(slug));
}
