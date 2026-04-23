import { describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import {
  CODEX_AUTH_REQUIRED_RE,
  CODEX_UNKNOWN_SESSION_RE,
  parseCodexJsonl,
} from "../../../adapter/codex-local/parse.js";

describe("parseCodexJsonl", () => {
  it("parses thread, item, and usage events into runtime events", async () => {
    const onEvent = vi.fn();
    const lines = [
      JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({ type: "item.completed", item: { id: "item-0", type: "agent_message", text: "Hello" } }),
      JSON.stringify({ type: "item.started", item: { id: "item-1", type: "command_execution", command: "ls", status: "in_progress" } }),
      JSON.stringify({ type: "item.completed", item: { id: "item-1", type: "command_execution", aggregated_output: "ok", exit_code: 0, status: "completed" } }),
      JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 3 } }),
    ];

    const output = await parseCodexJsonl(Readable.from(lines.join("\n") + "\n"), onEvent);

    expect(output.sessionId).toBe("thread-1");
    expect(output.result).toBe("Hello");
    expect(output.usage).toEqual({ input_tokens: 10, cached_input_tokens: 2, output_tokens: 3 });
    expect(output.events.map((event) => event.kind)).toEqual([
      "init",
      "assistant_text",
      "tool_use",
      "tool_result",
      "result",
    ]);
    expect(onEvent).toHaveBeenCalledTimes(5);
  });

  it("collects non-JSON lines", async () => {
    const output = await parseCodexJsonl(Readable.from("Reading additional input from stdin...\n"));
    expect(output.unparsedLines).toEqual(["Reading additional input from stdin..."]);
  });

  it("matches pinned error text", () => {
    expect(CODEX_UNKNOWN_SESSION_RE.test("thread/resume failed: no rollout found for thread id abc")).toBe(true);
    expect(CODEX_AUTH_REQUIRED_RE.test("please run codex login")).toBe(true);
  });
});
