import type { RuntimeStreamEvent, RunErrorCode } from "../types.js";
import type { CodexStreamEvent } from "./types.js";

export function mapCodexStreamEvent(event: CodexStreamEvent): RuntimeStreamEvent[] {
  if (event.type === "thread.started") {
    return [{ kind: "init", sessionId: event.thread_id, rawPayload: event }];
  }

  if (event.type === "turn.started") {
    return [];
  }

  if (event.type === "turn.completed") {
    return [{ kind: "result", usage: event.usage, costUsd: null, rawPayload: event }];
  }

  if (event.type === "error" || event.type === "turn.failed") {
    const message = extractErrorMessage(event);
    return [{
      kind: "error",
      errorCode: detectCodexError(message) ?? "process_error",
      message,
      rawPayload: event,
    }];
  }

  const item = event.item;
  const id = typeof item.id === "string" ? item.id : "";
  if (item.type === "agent_message") {
    if (event.type !== "item.completed") return [];
    return [{ kind: "assistant_text", type: event.type, text: typeof item.text === "string" ? item.text : "", rawPayload: event }];
  }

  if (item.type === "command_execution") {
    if (event.type === "item.started") {
      return [{
        kind: "tool_use",
        type: event.type,
        toolName: "Bash",
        input: { command: item.command ?? "" },
        toolUseId: id,
        rawPayload: event,
      }];
    }

    return [{
      kind: "tool_result",
      type: event.type,
      toolUseId: id,
      output: {
        stdout: item.aggregated_output ?? "",
        exit_code: item.exit_code ?? null,
      },
      isError: item.exit_code != null && item.exit_code !== 0,
      rawPayload: event,
    }];
  }

  if (item.type === "file_change") {
    if (event.type === "item.started") {
      return [{
        kind: "tool_use",
        type: event.type,
        toolName: "Edit",
        input: { changes: item.changes ?? [] },
        toolUseId: id,
        rawPayload: event,
      }];
    }

    return [{
      kind: "tool_result",
      type: event.type,
      toolUseId: id,
      output: { changes: item.changes ?? [], status: item.status ?? "completed" },
      isError: item.status === "failed",
      rawPayload: event,
    }];
  }

  return [];
}

function extractErrorMessage(event: Extract<CodexStreamEvent, { type: "error" | "turn.failed" }>): string {
  if (typeof event.message === "string") return event.message;
  if (typeof event.error === "string") return event.error;
  if (event.error && typeof event.error === "object" && "message" in event.error) {
    const message = (event.error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return JSON.stringify(event);
}

function detectCodexError(text: string): RunErrorCode | null {
  if (/not signed in|please run.*codex login|OPENAI_API_KEY/i.test(text)) return "auth_required";
  if (/no rollout found for thread id|thread\/resume failed/i.test(text)) return "unknown_session";
  if (/upstream|502|503|504|timed out|timeout|connection reset|temporarily unavailable/i.test(text)) {
    return "transient_upstream";
  }
  return null;
}
