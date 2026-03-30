// packages/daemon/src/adapter/output-parser.ts
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import type {
  StreamEvent,
  StreamInitEvent,
  StreamResultEvent,
  RunErrorCode,
} from "./types.js";

export interface ParsedOutput {
  sessionId: string | null;
  model: string | null;
  result: string | null;
  usage: StreamResultEvent["usage"] | null;
  costUsd: number | null;
  events: StreamEvent[];
  unparsedLines: string[];
}

export async function parseOutputStream(stream: Readable): Promise<ParsedOutput> {
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
    output.events.push(event);

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
