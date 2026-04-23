import type { RuntimeStreamEvent, StreamAssistantEvent, StreamEvent } from "./types.js";
import type { RunEventType } from "@orch/shared";

export interface MappedEvent {
  eventType: RunEventType;
  toolName: string | null;
  summary: string;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function summarizeToolUse(event: Extract<RuntimeStreamEvent, { kind: "tool_use" }>): string {
  const name = event.toolName;
  const input = event.input && typeof event.input === "object"
    ? event.input as Record<string, unknown>
    : {};

  switch (name) {
    case "Read":
    case "Edit":
    case "Write":
      return `${name} ${input.file_path ?? input.path ?? ""}`;
    case "Bash":
      return `Run ${truncate(String(input.command ?? ""), 79)}`;
    case "Grep":
      return `Search for "${input.pattern ?? ""}"`;
    case "Glob":
      return `Find ${input.pattern ?? ""}`;
    case "WebSearch":
      return `Search "${input.query ?? ""}"`;
    case "WebFetch":
      return `Fetch ${input.url ?? ""}`;
    case "Agent":
      return `Spawn ${input.description ?? ""}`;
    default:
      return name;
  }
}

type ClaudeContentBlock = StreamAssistantEvent["message"]["content"][number] & {
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
};

export function mapStreamEvent(event: RuntimeStreamEvent | StreamEvent): MappedEvent[] {
  if ("kind" in event) return mapRuntimeStreamEvent(event);

  if (event.type === "system" && "subtype" in event && event.subtype === "init") {
    return [{ eventType: "init", toolName: null, summary: `Session initialized (${event.model})` }];
  }

  if (event.type === "result") {
    return [{ eventType: "result", toolName: null, summary: `Run completed ($${event.total_cost_usd.toFixed(2)})` }];
  }

  if (event.type === "assistant") {
    return (event.message.content as ClaudeContentBlock[]).map((block) => {
      if (block.type === "tool_use") {
        return {
          eventType: "tool_use",
          toolName: block.name ?? "unknown",
          summary: summarizeToolUse({
            kind: "tool_use",
            toolName: block.name ?? "unknown",
            input: block.input ?? {},
            toolUseId: "",
            rawPayload: event,
          }),
        };
      }
      if (block.type === "tool_result") {
        return { eventType: "tool_result", toolName: null, summary: "Tool result" };
      }
      return { eventType: "assistant_text", toolName: null, summary: truncate(block.text ?? "", 120) };
    });
  }

  return [];
}

function mapRuntimeStreamEvent(event: RuntimeStreamEvent): MappedEvent[] {
  if (event.kind === "init") {
    return [
      {
        eventType: "init",
        toolName: null,
        summary: `Session initialized (${event.model ?? "unknown model"})`,
      },
    ];
  }

  if (event.kind === "result") {
    return [
      {
        eventType: "result",
        toolName: null,
        summary: event.costUsd != null
          ? `Run completed ($${event.costUsd.toFixed(2)})`
          : "Run completed",
      },
    ];
  }

  if (event.kind === "assistant_text") {
    return [{
      eventType: "assistant_text",
      toolName: null,
      summary: truncate(event.text, 120),
    }];
  }

  if (event.kind === "tool_use") {
    return [{
      eventType: "tool_use",
      toolName: event.toolName,
      summary: summarizeToolUse(event),
    }];
  }

  if (event.kind === "tool_result") {
    return [{ eventType: "tool_result", toolName: null, summary: "Tool result" }];
  }

  if (event.kind === "error") {
    return [{
      eventType: "error",
      toolName: null,
      summary: event.message,
    }];
  }

  return [];
}
