import { z } from "zod";

export const NotificationTypeSchema = z.enum([
  "verification_failed",
  "verification_passed",
  "budget_warning",
  "budget_exceeded",
  "agent_failure",
  "brainstorm_ready",
  "task_completed",
  "stuck_task",
]);

export const NotificationFilterSchema = z.object({
  projectId: z.string().optional(),
  unread: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().positive().default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export const MarkNotificationsReadSchema = z.union([
  z.object({ ids: z.array(z.string()).min(1) }),
  z.object({ all: z.literal(true) }),
]);

export type NotificationType = z.infer<typeof NotificationTypeSchema>;
export type NotificationFilter = z.infer<typeof NotificationFilterSchema>;
export type MarkNotificationsRead = z.infer<typeof MarkNotificationsReadSchema>;
