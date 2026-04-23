// packages/daemon/src/adapter/output-parser.ts
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import type {
  StreamEvent,
  StreamInitEvent,
  StreamResultEvent,
  RuntimeStreamEvent,
  RunErrorCode,
  Usage,
} from "./types.js";

export interface ParsedOutput {
  sessionId: string | null;
  model: string | null;
  result: string | null;
  usage: Usage | null;
  costUsd: number | null;
  events: RuntimeStreamEvent[];
  unparsedLines: string[];
}

type ClaudeContentBlock = {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
  id?: string;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
};

function mapClaudeStreamEvent(event: StreamEvent): RuntimeStreamEvent[] {
  if (event.type === "system" && (event as StreamInitEvent).subtype === "init") {
    const init = event as StreamInitEvent;
    return [{ kind: "init", type: event.type, sessionId: init.session_id, model: init.model, rawPayload: event }];
  }

  if (event.type === "result") {
    const result = event as StreamResultEvent;
    return [{
      kind: "result",
      type: event.type,
      usage: result.usage,
      costUsd: result.total_cost_usd,
      result: result.result,
      rawPayload: event,
    }];
  }

  if (event.type !== "assistant") {
    return [];
  }

  const blocks = event.message.content as ClaudeContentBlock[];
  return blocks.flatMap((block): RuntimeStreamEvent[] => {
    if (block.type === "text" && typeof block.text === "string") {
      return [{ kind: "assistant_text", type: event.type, text: block.text, rawPayload: event }];
    }

    if (block.type === "tool_use") {
      return [{
        kind: "tool_use",
        type: event.type,
        toolName: block.name ?? "unknown",
        input: block.input ?? {},
        toolUseId: block.id ?? "",
        rawPayload: event,
      }];
    }

    if (block.type === "tool_result") {
      return [{
        kind: "tool_result",
        type: event.type,
        toolUseId: block.tool_use_id ?? "",
        output: block.content ?? {},
        isError: block.is_error ?? false,
        rawPayload: event,
      }];
    }

    return [];
  });
}

export async function parseOutputStream(
  stream: Readable,
  onEvent?: (event: RuntimeStreamEvent) => void,
): Promise<ParsedOutput> {
  const output: ParsedOutput = {
    sessionId: null,
    model: null,
    result: null,
    usage: null,
    costUsd: null,
    events: [],
    unparsedLines: [],
  };

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

    const event = parsed as StreamEvent;
    const runtimeEvents = mapClaudeStreamEvent(event);
    for (const runtimeEvent of runtimeEvents) {
      if (onEvent) onEvent(runtimeEvent);
      output.events.push(runtimeEvent);
    }

    if (event.type === "system" && (event as StreamInitEvent).subtype === "init") {
      const init = event as StreamInitEvent;
      output.sessionId = init.session_id;
      output.model = init.model;
    }

    if (event.type === "result") {
      const result = event as StreamResultEvent;
      output.sessionId = result.session_id;
      output.model = result.model;
      output.result = result.result;
      output.usage = result.usage;
      output.costUsd = result.total_cost_usd;
    }
  }

  return output;
}

const AUTH_REQUIRED_PATTERN = /not logged in|please log in|please run.*claude login/i;

export function detectError(text: string): RunErrorCode | null {
  if (AUTH_REQUIRED_PATTERN.test(text)) {
    return "auth_required";
  }
  return null;
}
