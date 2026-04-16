import type { StreamEvent, StreamAssistantEvent } from "./types.js";
import type { RunEventType } from "@orch/shared";

export interface MappedEvent {
  eventType: RunEventType;
  toolName: string | null;
  summary: string;
}

type ContentBlock = StreamAssistantEvent["message"]["content"][number] & {
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
};

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function mapToolUse(block: ContentBlock): MappedEvent {
  const name = block.name ?? "unknown";
  const input = block.input ?? {};

  let summary: string;
  switch (name) {
    case "Read":
    case "Edit":
    case "Write":
      summary = `${name} ${input.file_path ?? ""}`;
      break;
    case "Bash":
      summary = `Run ${truncate(String(input.command ?? ""), 79)}`;
      break;
    case "Grep":
      summary = `Search for "${input.pattern ?? ""}"`;
      break;
    case "Glob":
      summary = `Find ${input.pattern ?? ""}`;
      break;
    case "WebSearch":
      summary = `Search "${input.query ?? ""}"`;
      break;
    case "WebFetch":
      summary = `Fetch ${input.url ?? ""}`;
      break;
    case "Agent":
      summary = `Spawn ${input.description ?? ""}`;
      break;
    default:
      summary = name;
  }

  return { eventType: "tool_use", toolName: name, summary };
}

function mapContentBlock(block: ContentBlock): MappedEvent {
  if (block.type === "tool_use") {
    return mapToolUse(block);
  }
  if (block.type === "tool_result") {
    return { eventType: "tool_result", toolName: null, summary: "Tool result" };
  }
  // text block
  return {
    eventType: "assistant_text",
    toolName: null,
    summary: truncate(block.text ?? "", 120),
  };
}

export function mapStreamEvent(event: StreamEvent): MappedEvent[] {
  if (event.type === "system" && "subtype" in event && event.subtype === "init") {
    return [
      {
        eventType: "init",
        toolName: null,
        summary: `Session initialized (${event.model})`,
      },
    ];
  }

  if (event.type === "result") {
    return [
      {
        eventType: "result",
        toolName: null,
        summary: `Run completed ($${event.total_cost_usd.toFixed(2)})`,
      },
    ];
  }

  if (event.type === "assistant") {
    const blocks = event.message.content as ContentBlock[];
    return blocks.map(mapContentBlock);
  }

  return [];
}
