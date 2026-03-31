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

  budgetAlert(projectId: string, payload: BudgetAlertPayload): void {
    this.send(projectId, { type: "budget_alert", ...payload });
  }

  /** Raw send for backward compat (brainstorm_output, etc.) */
  raw(projectId: string, message: unknown): void {
    this.send(projectId, message);
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
