// packages/daemon/src/__tests__/adapter/output-parser.test.ts
import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import {
  parseOutputStream,
  detectError,
} from "../../adapter/output-parser.js";

describe("parseOutputStream", () => {
  it("extracts session_id from init event", async () => {
    const lines = [
      JSON.stringify({ type: "system", subtype: "init", session_id: "s1", model: "claude-sonnet-4-6" }),
      JSON.stringify({ type: "result", session_id: "s1", result: "done", model: "claude-sonnet-4-6", usage: { input_tokens: 100, output_tokens: 50 }, total_cost_usd: 0.01 }),
    ];
    const stream = Readable.from(lines.join("\n") + "\n");
    const output = await parseOutputStream(stream);

    expect(output.sessionId).toBe("s1");
    expect(output.model).toBe("claude-sonnet-4-6");
  });

  it("extracts result data from result event", async () => {
    const lines = [
      JSON.stringify({ type: "system", subtype: "init", session_id: "s2", model: "claude-sonnet-4-6" }),
      JSON.stringify({ type: "result", session_id: "s2", result: "Fixed the bug", model: "claude-sonnet-4-6", usage: { input_tokens: 1000, cache_read_input_tokens: 500, output_tokens: 200 }, total_cost_usd: 0.05 }),
    ];
    const stream = Readable.from(lines.join("\n") + "\n");
    const output = await parseOutputStream(stream);

    expect(output.result).toBe("Fixed the bug");
    expect(output.usage).toEqual({ input_tokens: 1000, cache_read_input_tokens: 500, output_tokens: 200 });
    expect(output.costUsd).toBe(0.05);
  });

  it("collects all events in order", async () => {
    const lines = [
      JSON.stringify({ type: "system", subtype: "init", session_id: "s3", model: "claude-sonnet-4-6" }),
      JSON.stringify({ type: "assistant", session_id: "s3", message: { content: [{ type: "text", text: "Hello" }] } }),
      JSON.stringify({ type: "result", session_id: "s3", result: "Done", model: "claude-sonnet-4-6", usage: { input_tokens: 100, output_tokens: 50 }, total_cost_usd: 0.01 }),
    ];
    const stream = Readable.from(lines.join("\n") + "\n");
    const output = await parseOutputStream(stream);

    expect(output.events).toHaveLength(3);
    expect(output.events[0].type).toBe("system");
    expect(output.events[1].type).toBe("assistant");
    expect(output.events[2].type).toBe("result");
  });

  it("skips blank lines", async () => {
    const lines = [
      JSON.stringify({ type: "system", subtype: "init", session_id: "s4", model: "claude-sonnet-4-6" }),
      "",
      "",
      JSON.stringify({ type: "result", session_id: "s4", result: "OK", model: "claude-sonnet-4-6", usage: { input_tokens: 10, output_tokens: 5 }, total_cost_usd: 0.001 }),
    ];
    const stream = Readable.from(lines.join("\n") + "\n");
    const output = await parseOutputStream(stream);

    expect(output.events).toHaveLength(2);
  });

  it("skips lines that are not valid JSON", async () => {
    const lines = [
      "not json",
      JSON.stringify({ type: "system", subtype: "init", session_id: "s5", model: "claude-sonnet-4-6" }),
      JSON.stringify({ type: "result", session_id: "s5", result: "OK", model: "claude-sonnet-4-6", usage: { input_tokens: 10, output_tokens: 5 }, total_cost_usd: 0.001 }),
    ];
    const stream = Readable.from(lines.join("\n") + "\n");
    const output = await parseOutputStream(stream);

    expect(output.events).toHaveLength(2);
    expect(output.unparsedLines).toContain("not json");
  });

  it("handles empty stream", async () => {
    const stream = Readable.from("");
    const output = await parseOutputStream(stream);

    expect(output.sessionId).toBeNull();
    expect(output.events).toHaveLength(0);
  });
});

describe("detectError", () => {
  it("detects auth_required from text", () => {
    expect(detectError("Error: not logged in")).toBe("auth_required");
    expect(detectError("please run `claude login`")).toBe("auth_required");
    expect(detectError("Please log in first")).toBe("auth_required");
  });

  it("returns null for normal text", () => {
    expect(detectError("Everything is fine")).toBeNull();
  });
});
