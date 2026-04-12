import { z } from "zod";
import { ChatCardSchema } from "./chat-cards.js";

// ─── Chat CRUD ────────────────────────────────────────────

export const CreateChatSchema = z.object({
  projectId: z.string().min(1),
  agentId: z.string().min(1).optional(),
  title: z.string().min(1).max(200).optional(),
  seedMessage: z.string().min(1).max(10_000).optional(),
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

/**
 * Strict variant: parses an ExtractedCard, then additionally validates
 * that the (kind, payload) pair matches the discriminated union. Used by
 * the dashboard to gate rendering — invalid cards fall back to the
 * error-card component.
 *
 * The daemon parser intentionally does NOT use this, because the daemon
 * must accept-and-store malformed LLM output (turning it into a
 * `result_error` card) rather than rejecting the whole message.
 */
export function parseStrictCard(
  raw: unknown,
):
  | { ok: true; card: import("./chat-cards.js").ChatCard }
  | { ok: false; issues: import("zod").z.ZodIssue[] } {
  const enveloped = ChatCardSchema.safeParse(raw);
  if (enveloped.success) return { ok: true, card: enveloped.data };
  return { ok: false, issues: enveloped.error.issues };
}
