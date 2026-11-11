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
// Codex can exit zero after its shell sandbox fails to start, reporting the
// failure only in an assistant message. Such a run did not inspect the repo.
export const CODEX_SANDBOX_STARTUP_RE =
  /bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted/i;

export function codexSandboxStartupFailed(output: CodexParsedOutput): boolean {
  const result = (output.result ?? "").trim();
  // The live planner reports a blocked environment after an introductory
  // message, without ever emitting a command event or a nonzero exit code.
  const directFailure = /^(?:`[^`\n]+`|(?:the )?(?:command|shell|sandbox))\s+(?:failed|could not run)\b/i.test(result) &&
    /bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted\.?$/i.test(result);
  const blockedRun = /(?:^|[.!?]\s*)(?:[A-Z]+-\d+|(?:the )?(?:task|run)) is blocked by the execution environment:\s*shell commands fail with\b/i.test(result) &&
    /I couldn.t (?:read|run|inspect)\b/i.test(result) &&
    /No files were changed, no plan was written, and the pipeline completion endpoint was not called\./i.test(result);
  return !output.rawEvents.some(event =>
    (event as { item?: { type?: string } }).item?.type === "command_execution") &&
    CODEX_SANDBOX_STARTUP_RE.test(result) && (directFailure || blockedRun);
}

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
