import { describe, it, expect, vi } from "vitest";
import { Readable } from "node:stream";
import { parseOutputStream } from "../../adapter/output-parser.js";
import type { StreamEvent } from "../../adapter/types.js";

function createStream(lines: string[]): Readable {
  const stream = new Readable({ read() {} });
  queueMicrotask(() => {
    for (const line of lines) {
      stream.push(line + "\n");
    }
    stream.push(null);
  });
  return stream;
}

describe("parseOutputStream onEvent callback", () => {
  it("calls onEvent for each parsed JSON line", async () => {
    const onEvent = vi.fn();
    const initLine = JSON.stringify({ type: "system", subtype: "init", session_id: "s1", model: "claude-sonnet-4-6" });
    const assistantLine = JSON.stringify({ type: "assistant", session_id: "s1", message: { content: [{ type: "text", text: "Hello" }] } });
    const resultLine = JSON.stringify({ type: "result", session_id: "s1", result: "Done", model: "claude-sonnet-4-6", usage: { input_tokens: 10, output_tokens: 5 }, total_cost_usd: 0.01 });

    await parseOutputStream(createStream([initLine, assistantLine, resultLine]), onEvent);

    expect(onEvent).toHaveBeenCalledTimes(3);
    expect(onEvent.mock.calls[0][0].type).toBe("system");
    expect(onEvent.mock.calls[1][0].type).toBe("assistant");
    expect(onEvent.mock.calls[2][0].type).toBe("result");
  });

  it("does not call onEvent for unparseable lines", async () => {
    const onEvent = vi.fn();
    const initLine = JSON.stringify({ type: "system", subtype: "init", session_id: "s1", model: "claude-sonnet-4-6" });

    await parseOutputStream(createStream([initLine, "not json", ""]), onEvent);

    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it("works without onEvent callback (backward compat)", async () => {
    const initLine = JSON.stringify({ type: "system", subtype: "init", session_id: "s1", model: "claude-sonnet-4-6" });

    const output = await parseOutputStream(createStream([initLine]));

    expect(output.sessionId).toBe("s1");
    expect(output.events).toHaveLength(1);
  });

  it("still collects events in output when onEvent is provided", async () => {
    const onEvent = vi.fn();
    const initLine = JSON.stringify({ type: "system", subtype: "init", session_id: "s1", model: "claude-sonnet-4-6" });

    const output = await parseOutputStream(createStream([initLine]), onEvent);

    expect(output.events).toHaveLength(1);
    expect(output.sessionId).toBe("s1");
  });
});
