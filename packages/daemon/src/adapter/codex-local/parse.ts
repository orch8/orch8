import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import type { RuntimeStreamEvent, RunErrorCode, Usage } from "../types.js";
import type { CodexStreamEvent } from "./types.js";
import { mapCodexStreamEvent } from "./tool-mapper.js";

export interface CodexParsedOutput {
  sessionId: string | null;
  model: string | null;
  result: string | null;
  usage: Usage | null;
  costUsd: number | null;
  events: RuntimeStreamEvent[];
  rawEvents: CodexStreamEvent[];
  unparsedLines: string[];
}

export async function parseCodexJsonl(
  stream: Readable,
  onEvent?: (event: RuntimeStreamEvent) => void,
): Promise<CodexParsedOutput> {
  const output: CodexParsedOutput = {
    sessionId: null,
    model: null,
    result: null,
    usage: null,
    costUsd: null,
    events: [],
    rawEvents: [],
    unparsedLines: [],
  };

  const assistantText: string[] = [];
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      output.unparsedLines.push(trimmed);
      continue;
    }

    const rawEvent = parsed as CodexStreamEvent;
    output.rawEvents.push(rawEvent);
    if (rawEvent.type === "thread.started") {
      output.sessionId = rawEvent.thread_id;
    }
    if (rawEvent.type === "turn.completed") {
      output.usage = rawEvent.usage ?? null;
    }

    const runtimeEvents = mapCodexStreamEvent(rawEvent);
    for (const event of runtimeEvents) {
      if (event.kind === "assistant_text") assistantText.push(event.text);
      if (onEvent) onEvent(event);
      output.events.push(event);
    }
  }

  output.result = assistantText.length > 0 ? assistantText.join("") : null;
  return output;
}

export const CODEX_UNKNOWN_SESSION_RE =
  /no rollout found for thread id|thread\/resume failed/i;
export const CODEX_AUTH_REQUIRED_RE =
  /not signed in|please run.*codex login|OPENAI_API_KEY/i;
export const CODEX_TRANSIENT_UPSTREAM_RE =
  /upstream|502|503|504|timed out|timeout|connection reset|temporarily unavailable/i;

export function isCodexUnknownSessionError(text: string): boolean {
  return CODEX_UNKNOWN_SESSION_RE.test(text);
}

export function isCodexAuthError(text: string): boolean {
  return CODEX_AUTH_REQUIRED_RE.test(text);
}

export function isCodexTransientUpstreamError(text: string): boolean {
  return CODEX_TRANSIENT_UPSTREAM_RE.test(text);
}

export function detectCodexError(text: string): RunErrorCode | null {
  if (isCodexAuthError(text)) return "auth_required";
  if (isCodexUnknownSessionError(text)) return "unknown_session";
  if (isCodexTransientUpstreamError(text)) return "transient_upstream";
  return null;
}
