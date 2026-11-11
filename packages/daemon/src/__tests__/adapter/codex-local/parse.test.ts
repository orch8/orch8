import { describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import {
  CODEX_AUTH_REQUIRED_RE,
  CODEX_UNKNOWN_SESSION_RE,
  codexSandboxStartupFailed,
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

  it("recognizes a zero-exit sandbox startup failure without command execution", async () => {
    const lines = [
      { type: "thread.started", thread_id: "thread-1" },
      { type: "turn.started" },
      { type: "item.completed", item: { id: "item_0", type: "agent_message", text: "`pwd` could not run: the shell sandbox failed with bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted" } },
      { type: "turn.completed", usage: { input_tokens: 10, output_tokens: 5 } },
    ];
    const output = await parseCodexJsonl(Readable.from(lines.map(line => JSON.stringify(line)).join("\n") + "\n"));
    expect(codexSandboxStartupFailed(output)).toBe(true);
    output.rawEvents.push({ type: "item.completed", item: { id: "item_1", type: "command_execution", command: "pwd", status: "completed", exit_code: 0 } } as typeof output.rawEvents[number]);
    expect(codexSandboxStartupFailed(output)).toBe(false);
    output.rawEvents.pop();
    output.result = "The error string bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted can occur on some hosts.";
    expect(codexSandboxStartupFailed(output)).toBe(false);
    output.result = "For example, `pwd` could not run: the shell sandbox failed with bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted.";
    expect(codexSandboxStartupFailed(output)).toBe(false);
    output.result = "`pwd` could not run: the shell sandbox failed with bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted is an example of an error; I did not run a command.";
    expect(codexSandboxStartupFailed(output)).toBe(false);
    output.result = "I’ll inspect the repository. FAC-3 is blocked by the execution environment: shell commands fail with `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`.\n\nI couldn’t read the skill or inspect the repository. No files were changed, no plan was written, and the pipeline completion endpoint was not called.\n\nPlease restore shell execution and rerun FAC-3.";
    expect(codexSandboxStartupFailed(output)).toBe(true);
    output.result = "An example follows. FAC-3 is blocked by the execution environment: shell commands fail with `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`. This is sample text, not a failure.";
    expect(codexSandboxStartupFailed(output)).toBe(false);
  });
});
