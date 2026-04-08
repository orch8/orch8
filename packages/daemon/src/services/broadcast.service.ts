import type { WebSocket } from "ws";

export interface TaskTransitionedPayload {
  taskId: string;
  from: string;
  to: string;
  agentId?: string;
}

export interface AgentPausedPayload {
  agentId: string;
  reason?: string | null;
}

export interface AgentResumedPayload {
  agentId: string;
}

export interface RunCreatedPayload {
  runId: string;
  agentId: string;
  status: string;
  taskId?: string;
}

export interface RunCompletedPayload {
  runId: string;
  agentId: string;
  status: string;
  costUsd?: number | null;
}

export interface RunFailedPayload {
  runId: string;
  agentId: string;
  status: string;
  error?: string | null;
}

export interface BudgetAlertPayload {
  level: "agent" | "project";
  entityId: string;
  message: string;
  budgetLimitUsd?: number | null;
  budgetSpentUsd?: number;
}

export interface NotificationNewPayload {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
}

export interface VerificationVerdictPayload {
  taskId: string;
  verdict: string;
  agentId: string;
  commentId: string;
}

export interface VerificationResponsePayload {
  taskId: string;
  agentId: string;
  commentId: string;
}

export interface VerificationRefereePayload {
  taskId: string;
  verdict: string;
  agentId: string;
  commentId: string;
}

export interface DaemonLogPayload {
  level: string;
  message: string;
  timestamp: string;
}

export interface DaemonStatsPayload {
  uptimeMs: number;
  processCount: number;
  queueDepth: number;
  tickIntervalMs: number;
}

export interface ActivityNewPayload {
  id: number;
  level: string;
  agentId: string | null;
  taskId: string | null;
  message: string;
  timestamp: string;
}

export interface CommentNewPayload {
  taskId: string;
  commentId: string;
  type: string;
  authorId: string;
}

export interface RunEventPayload {
  runId: string;
  seq: number;
  eventType: string;
  toolName: string | null;
  summary: string;
  timestamp: string;
  payload: unknown;
}

export interface ChatMessageStartedPayload {
  chatId: string;
  messageId: string;
}

export interface ChatMessageChunkPayload {
  chatId: string;
  messageId: string;
  chunk: string;
}

export interface ChatMessageCompletePayload {
  chatId: string;
  messageId: string;
  runId: string | null;
  cardCount: number;
}

export interface ChatMessageErrorPayload {
  chatId: string;
  messageId: string | null;
  error: string;
}

export interface ChatCardDecisionPayload {
  chatId: string;
  cardId: string;
  status: "approved" | "cancelled";
}

export class BroadcastService {
  constructor(private sockets: Set<WebSocket>) {}

  taskTransitioned(projectId: string, payload: TaskTransitionedPayload): void {
    this.send(projectId, { type: "task_transitioned", ...payload });
  }

  agentPaused(projectId: string, payload: AgentPausedPayload): void {
    this.send(projectId, { type: "agent_paused", ...payload });
  }

  agentResumed(projectId: string, payload: AgentResumedPayload): void {
    this.send(projectId, { type: "agent_resumed", ...payload });
  }

  runCreated(projectId: string, payload: RunCreatedPayload): void {
    this.send(projectId, { type: "run_created", ...payload });
  }

  runCompleted(projectId: string, payload: RunCompletedPayload): void {
    this.send(projectId, { type: "run_completed", ...payload });
  }

  runFailed(projectId: string, payload: RunFailedPayload): void {
    this.send(projectId, { type: "run_failed", ...payload });
  }

  runEvent(projectId: string, payload: RunEventPayload): void {
    this.send(projectId, { type: "run_event", ...payload });
  }

  budgetAlert(projectId: string, payload: BudgetAlertPayload): void {
    this.send(projectId, { type: "budget_alert", ...payload });
  }

  notificationNew(projectId: string, payload: NotificationNewPayload): void {
    this.send(projectId, { ...payload, notificationType: payload.type, type: "notification:new" });
  }

  verificationVerdict(projectId: string, payload: VerificationVerdictPayload): void {
    this.send(projectId, { type: "verification:verdict", ...payload });
  }

  verificationResponse(projectId: string, payload: VerificationResponsePayload): void {
    this.send(projectId, { type: "verification:response", ...payload });
  }

  verificationReferee(projectId: string, payload: VerificationRefereePayload): void {
    this.send(projectId, { type: "verification:referee", ...payload });
  }

  daemonLog(payload: DaemonLogPayload): void {
    this.send("__system__", { type: "daemon:log", ...payload });
  }

  daemonStats(payload: DaemonStatsPayload): void {
    this.send("__system__", { type: "daemon:stats", ...payload });
  }

  activityNew(projectId: string, payload: ActivityNewPayload): void {
    this.send(projectId, { type: "activity:new", ...payload });
  }

  commentNew(projectId: string, payload: CommentNewPayload): void {
    this.send(projectId, { ...payload, type: "comment:new" });
  }

  chatMessageStarted(projectId: string, payload: ChatMessageStartedPayload): void {
    this.send(projectId, { type: "chat_message_started", ...payload });
  }

  chatMessageChunk(projectId: string, payload: ChatMessageChunkPayload): void {
    this.send(projectId, { type: "chat_message_chunk", ...payload });
  }

  chatMessageComplete(projectId: string, payload: ChatMessageCompletePayload): void {
    this.send(projectId, { type: "chat_message_complete", ...payload });
  }

  chatMessageError(projectId: string, payload: ChatMessageErrorPayload): void {
    this.send(projectId, { type: "chat_message_error", ...payload });
  }

  chatCardDecision(projectId: string, payload: ChatCardDecisionPayload): void {
    this.send(projectId, { type: "chat_card_decision", ...payload });
  }

  private send(_projectId: string, message: unknown): void {
    const data = JSON.stringify(message);
    for (const socket of this.sockets) {
      if (socket.readyState === 1) {
        socket.send(data);
      }
    }
  }
}
