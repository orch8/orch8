import { z } from "zod";

// ─── Chat CRUD ────────────────────────────────────────────

export const CreateChatSchema = z.object({
  projectId: z.string().min(1),
  agentId: z.string().min(1).optional(),
  title: z.string().min(1).max(200).optional(),
});
export type CreateChat = z.infer<typeof CreateChatSchema>;

export const UpdateChatSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
});
export type UpdateChat = z.infer<typeof UpdateChatSchema>;

// ─── Sending Messages ────────────────────────────────────

export const SendChatMessageSchema = z.object({
  content: z.string().min(1).max(100_000),
});
export type SendChatMessage = z.infer<typeof SendChatMessageSchema>;

// ─── Card Decisions ──────────────────────────────────────

export const CardDecisionSchema = z.object({
  decision: z.enum(["approved", "cancelled"]),
  actor: z.string().min(1).max(200).optional(),
});
export type CardDecision = z.infer<typeof CardDecisionSchema>;

// ─── Extracted Card (envelope only; per-kind schemas live in a later plan) ──

export const CardStatusSchema = z.enum([
  "pending", "approved", "cancelled", "executed", "error",
]);
export type CardStatus = z.infer<typeof CardStatusSchema>;

export const ExtractedCardSchema = z.object({
  id: z.string(),
  kind: z.string().min(1),
  summary: z.string().default(""),
  payload: z.unknown(),
  status: CardStatusSchema.default("pending"),
  decidedAt: z.string().nullable().default(null),
  decidedBy: z.string().nullable().default(null),
  resultRunId: z.string().nullable().default(null),
});
export type ExtractedCard = z.infer<typeof ExtractedCardSchema>;
