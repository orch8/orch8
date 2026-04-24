/**
 * Discriminated union of every WebSocket event the daemon broadcasts over
 * /ws. Each variant pairs a literal `type` discriminator with the typed
 * payload the daemon puts on the wire (see
 * packages/daemon/src/services/broadcast.service.ts — the payloads below
 * mirror that file's PayloadInterface definitions, plus the spread `type`
 * field the broadcaster attaches before sending).
 *
 * This type is the single source of truth shared by both sides of the
 * socket:
 *   - Daemon: write-side. (Broadcast methods should ideally satisfy these
 *     shapes; today the daemon enforces this only structurally because the
 *     broadcast service predates this union.)
 *   - Dashboard: read-side. WsEventsProvider narrows on `event.type` and
 *     each case arm sees a concrete payload with no `as any` casts.
 *
 * Kept deliberately as a pure TypeScript type (no zod schema) because
 * nothing on the wire needs runtime validation — the websocket is a
 * trusted in-cluster channel and the dashboard only invalidates queries
 * on receipt.
 */

export interface WsTaskTransitionedEvent {
  type: "task_transitioned";
  taskId: string;
  from: string;
  to: string;
  agentId?: string;
}

export interface WsAgentPausedEvent {
  type: "agent_paused";
  agentId: string;
  reason?: string | null;
}

export interface WsAgentResumedEvent {
  type: "agent_resumed";
  agentId: string;
}

export interface WsRunCreatedEvent {
  type: "run_created";
  runId: string;
  agentId: string;
  status: string;
  taskId?: string;
}

export interface WsRunCompletedEvent {
  type: "run_completed";
  runId: string;
  agentId: string;
  status: string;
  costUsd?: number | null;
}

export interface WsRunFailedEvent {
  type: "run_failed";
  runId: string;
  agentId: string;
  status: string;
  error?: string | null;
}

export interface WsRunEvent {
  type: "run_event";
  runId: string;
  seq: number;
  eventType: string;
  toolName: string | null;
  summary: string;
  timestamp: string;
  payload: unknown;
}

export interface WsBudgetAlertEvent {
  type: "budget_alert";
  level: "agent" | "project";
  entityId: string;
  message: string;
  budgetLimitUsd?: number | null;
  budgetSpentUsd?: number;
}

/**
 * Note: the daemon renames the notification's own `type` field to
 * `notificationType` before broadcasting so it doesn't collide with the
 * discriminator.
 */
export interface WsNotificationNewEvent {
  type: "notification:new";
  id: string;
  notificationType: string;
  title: string;
  message: string;
  link: string | null;
}

export interface WsVerificationVerdictEvent {
  type: "verification:verdict";
  taskId: string;
  verdict: string;
  agentId: string;
  commentId: string;
}

export interface WsVerificationResponseEvent {
  type: "verification:response";
  taskId: string;
  agentId: string;
  commentId: string;
}

export interface WsVerificationRefereeEvent {
  type: "verification:referee";
  taskId: string;
  verdict: string;
  agentId: string;
  commentId: string;
}

export interface WsDaemonLogEvent {
  type: "daemon:log";
  level: string;
  message: string;
  timestamp: string;
  source?: string;
  code?: string;
  errorId?: string;
  projectId?: string;
  runId?: string;
  taskId?: string;
}

export interface WsDaemonStatsEvent {
  type: "daemon:stats";
  uptimeMs: number;
  processCount: number;
  queueDepth: number;
  tickIntervalMs: number;
}

export interface WsActivityNewEvent {
  type: "activity:new";
  id: number;
  level: string;
  agentId: string | null;
  taskId: string | null;
  message: string;
  timestamp: string;
}

/**
 * Note: the daemon spreads the comment payload and then overwrites the
 * comment's own `type` field with `"comment:new"`, so the comment's own
 * `type` (e.g. "feedback") is NOT available on the wire.
 */
export interface WsCommentNewEvent {
  type: "comment:new";
  taskId: string;
  commentId: string;
  authorId: string;
}

export interface WsChatMessageStartedEvent {
  type: "chat_message_started";
  chatId: string;
  messageId: string;
}

export interface WsChatMessageChunkEvent {
  type: "chat_message_chunk";
  chatId: string;
  messageId: string;
  chunk: string;
}

export interface WsChatMessageCompleteEvent {
  type: "chat_message_complete";
  chatId: string;
  messageId: string;
  runId: string | null;
  cardCount: number;
}

export interface WsChatMessageErrorEvent {
  type: "chat_message_error";
  chatId: string;
  messageId: string | null;
  error: string;
}

export interface WsChatCardDecisionEvent {
  type: "chat_card_decision";
  chatId: string;
  cardId: string;
  status: "approved" | "cancelled";
}

export type WsEvent =
  | WsTaskTransitionedEvent
  | WsAgentPausedEvent
  | WsAgentResumedEvent
  | WsRunCreatedEvent
  | WsRunCompletedEvent
  | WsRunFailedEvent
  | WsRunEvent
  | WsBudgetAlertEvent
  | WsNotificationNewEvent
  | WsVerificationVerdictEvent
  | WsVerificationResponseEvent
  | WsVerificationRefereeEvent
  | WsDaemonLogEvent
  | WsDaemonStatsEvent
  | WsActivityNewEvent
  | WsCommentNewEvent
  | WsChatMessageStartedEvent
  | WsChatMessageChunkEvent
  | WsChatMessageCompleteEvent
  | WsChatMessageErrorEvent
  | WsChatCardDecisionEvent;

export type WsEventType = WsEvent["type"];

/**
 * Type helper: given an event `type` discriminator, resolves to the
 * corresponding variant. Useful for subscriber callbacks that want to
 * narrow on a single event kind.
 */
export type WsEventByType<T extends WsEventType> = Extract<WsEvent, { type: T }>;
