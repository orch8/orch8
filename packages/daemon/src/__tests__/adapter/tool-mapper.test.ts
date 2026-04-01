import { describe, it, expect } from "vitest";
import { mapStreamEvent } from "../../adapter/tool-mapper.js";
import type { StreamInitEvent, StreamAssistantEvent, StreamResultEvent } from "../../adapter/types.js";

describe("mapStreamEvent", () => {
  it("maps init event", () => {
    const event: StreamInitEvent = {
      type: "system",
      subtype: "init",
      session_id: "s1",
      model: "claude-sonnet-4-6",
    };
    const mapped = mapStreamEvent(event);
    expect(mapped).toEqual([
      {
        eventType: "init",
        toolName: null,
        summary: "Session initialized (claude-sonnet-4-6)",
      },
    ]);
  });

  it("maps result event", () => {
    const event: StreamResultEvent = {
      type: "result",
      session_id: "s1",
      result: "Done",
      model: "claude-sonnet-4-6",
      usage: { input_tokens: 100, output_tokens: 50 },
      total_cost_usd: 0.03,
    };
    const mapped = mapStreamEvent(event);
    expect(mapped).toEqual([
      {
        eventType: "result",
        toolName: null,
        summary: "Run completed ($0.03)",
      },
    ]);
  });

  it("maps assistant text block", () => {
    const event: StreamAssistantEvent = {
      type: "assistant",
      session_id: "s1",
      message: {
        content: [{ type: "text", text: "I will read the file now." }],
      },
    };
    const mapped = mapStreamEvent(event);
    expect(mapped).toEqual([
      {
        eventType: "assistant_text",
        toolName: null,
        summary: "I will read the file now.",
      },
    ]);
  });

  it("truncates long assistant text to 120 chars", () => {
    const longText = "A".repeat(200);
    const event: StreamAssistantEvent = {
      type: "assistant",
      session_id: "s1",
      message: { content: [{ type: "text", text: longText }] },
    };
    const mapped = mapStreamEvent(event);
    expect(mapped[0].summary).toBe("A".repeat(120) + "…");
  });

  it("maps tool_use Read", () => {
    const event: StreamAssistantEvent = {
      type: "assistant",
      session_id: "s1",
      message: {
        content: [
          { type: "tool_use", name: "Read", input: { file_path: "/src/index.ts" } } as any,
        ],
      },
    };
    const mapped = mapStreamEvent(event);
    expect(mapped).toEqual([
      { eventType: "tool_use", toolName: "Read", summary: "Read /src/index.ts" },
    ]);
  });

  it("maps tool_use Edit", () => {
    const event: StreamAssistantEvent = {
      type: "assistant",
      session_id: "s1",
      message: {
        content: [
          { type: "tool_use", name: "Edit", input: { file_path: "/src/app.ts" } } as any,
        ],
      },
    };
    const mapped = mapStreamEvent(event);
    expect(mapped).toEqual([
      { eventType: "tool_use", toolName: "Edit", summary: "Edit /src/app.ts" },
    ]);
  });

  it("maps tool_use Bash with truncated command", () => {
    const longCmd = "npm run build -- --watch --mode production --verbose " + "x".repeat(100);
    const event: StreamAssistantEvent = {
      type: "assistant",
      session_id: "s1",
      message: {
        content: [
          { type: "tool_use", name: "Bash", input: { command: longCmd } } as any,
        ],
      },
    };
    const mapped = mapStreamEvent(event);
    expect(mapped[0].toolName).toBe("Bash");
    expect(mapped[0].summary.length).toBeLessThanOrEqual(84); // "Run " + 80 chars
    expect(mapped[0].summary.endsWith("…")).toBe(true);
  });

  it("maps tool_use Grep", () => {
    const event: StreamAssistantEvent = {
      type: "assistant",
      session_id: "s1",
      message: {
        content: [
          { type: "tool_use", name: "Grep", input: { pattern: "TODO" } } as any,
        ],
      },
    };
    const mapped = mapStreamEvent(event);
    expect(mapped).toEqual([
      { eventType: "tool_use", toolName: "Grep", summary: 'Search for "TODO"' },
    ]);
  });

  it("maps tool_use Glob", () => {
    const event: StreamAssistantEvent = {
      type: "assistant",
      session_id: "s1",
      message: {
        content: [
          { type: "tool_use", name: "Glob", input: { pattern: "**/*.ts" } } as any,
        ],
      },
    };
    const mapped = mapStreamEvent(event);
    expect(mapped).toEqual([
      { eventType: "tool_use", toolName: "Glob", summary: "Find **/*.ts" },
    ]);
  });

  it("maps tool_use Agent", () => {
    const event: StreamAssistantEvent = {
      type: "assistant",
      session_id: "s1",
      message: {
        content: [
          { type: "tool_use", name: "Agent", input: { description: "explore codebase" } } as any,
        ],
      },
    };
    const mapped = mapStreamEvent(event);
    expect(mapped).toEqual([
      { eventType: "tool_use", toolName: "Agent", summary: "Spawn explore codebase" },
    ]);
  });

  it("maps unknown tool_use with tool name as summary", () => {
    const event: StreamAssistantEvent = {
      type: "assistant",
      session_id: "s1",
      message: {
        content: [
          { type: "tool_use", name: "CustomTool", input: { foo: "bar" } } as any,
        ],
      },
    };
    const mapped = mapStreamEvent(event);
    expect(mapped).toEqual([
      { eventType: "tool_use", toolName: "CustomTool", summary: "CustomTool" },
    ]);
  });

  it("maps tool_result blocks", () => {
    const event: StreamAssistantEvent = {
      type: "assistant",
      session_id: "s1",
      message: {
        content: [
          { type: "tool_result", tool_use_id: "toolu_1", content: "file contents..." } as any,
        ],
      },
    };
    const mapped = mapStreamEvent(event);
    expect(mapped).toEqual([
      { eventType: "tool_result", toolName: null, summary: "Tool result" },
    ]);
  });

  it("maps multiple content blocks from one assistant event", () => {
    const event: StreamAssistantEvent = {
      type: "assistant",
      session_id: "s1",
      message: {
        content: [
          { type: "text", text: "Let me read that." },
          { type: "tool_use", name: "Read", input: { file_path: "/a.ts" } } as any,
        ],
      },
    };
    const mapped = mapStreamEvent(event);
    expect(mapped).toHaveLength(2);
    expect(mapped[0].eventType).toBe("assistant_text");
    expect(mapped[1].eventType).toBe("tool_use");
  });
});
