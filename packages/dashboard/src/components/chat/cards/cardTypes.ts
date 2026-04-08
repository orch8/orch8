import type { ChatCard, ChatCardKind } from "@orch/shared";
import type { ChatCard as ExtractedCard } from "../../../hooks/useChatMessages.js";

/**
 * Props every card component receives. The validated discriminated-union
 * payload comes via `card`; the raw extracted card (with its id, status,
 * decided fields) comes via `extracted`. Components that need to call
 * useCardDecision use `extracted.id` and `chatId`.
 */
export interface CardComponentProps<K extends ChatCardKind> {
  card: Extract<ChatCard, { kind: K }>;
  extracted: ExtractedCard;
  chatId: string;
  projectId: string;
}
