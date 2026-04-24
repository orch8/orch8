import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { NotificationFilterSchema, MarkNotificationsReadSchema } from "@orch/shared";
import { resolveProjectValue } from "../utils/project-resolver.js";
import "../../types.js";

export async function notificationRoutes(app: FastifyInstance) {
  // GET /api/notifications — List notifications
  app.get("/api/notifications", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = NotificationFilterSchema.safeParse(request.query);
    const filter = parsed.success ? parsed.data : { limit: 50, offset: 0 };
    const projectId = await resolveProjectValue(app, filter.projectId) ?? request.projectId;

    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    const rows = await app.notificationService.list(projectId, {
      unread: filter.unread,
      limit: filter.limit,
      offset: filter.offset,
    });

    return rows;
  });

  // POST /api/notifications/read — Mark notifications as read
  app.post("/api/notifications/read", async (request: FastifyRequest, reply: FastifyReply) => {
    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    const parsed = MarkNotificationsReadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
    }

    if ("all" in parsed.data) {
      await app.notificationService.markAllRead(projectId);
    } else {
      await app.notificationService.markRead(projectId, parsed.data.ids);
    }

    return { ok: true };
  });
}
