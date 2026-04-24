import { z } from "zod";

export const CommentTypeSchema = z.enum(["inline", "system", "verification", "brainstorm"]);

export const CreateCommentSchema = z.object({
  taskId: z.string().min(1),
  author: z.string().min(1),
  body: z.string().min(1).max(50000),
  type: CommentTypeSchema.default("inline"),
  lineRef: z.string().max(500).optional(),
  notify: z.boolean().default(true).optional(),
});

export const CommentFilterSchema = z.object({
  taskId: z.string().optional(),
  type: CommentTypeSchema.optional(),
  author: z.string().optional(),
});

export type CreateComment = z.infer<typeof CreateCommentSchema>;
export type CommentFilter = z.infer<typeof CommentFilterSchema>;
