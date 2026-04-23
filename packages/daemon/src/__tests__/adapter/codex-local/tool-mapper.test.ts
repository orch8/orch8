import { describe, expect, it } from "vitest";
import { mapCodexStreamEvent } from "../../../adapter/codex-local/tool-mapper.js";

describe("mapCodexStreamEvent", () => {
  it("maps command execution lifecycle", () => {
    expect(mapCodexStreamEvent({
      type: "item.started",
      item: { id: "cmd-1", type: "command_execution", command: "npm test" },
    })).toEqual([{
      kind: "tool_use",
      type: "item.started",
      toolName: "Bash",
      input: { command: "npm test" },
      toolUseId: "cmd-1",
      rawPayload: {
        type: "item.started",
        item: { id: "cmd-1", type: "command_execution", command: "npm test" },
      },
    }]);

    const [result] = mapCodexStreamEvent({
      type: "item.completed",
      item: { id: "cmd-1", type: "command_execution", aggregated_output: "boom", exit_code: 1 },
    });

    expect(result.kind).toBe("tool_result");
    if (result.kind === "tool_result") {
      expect(result.isError).toBe(true);
    }
  });

  it("drops unknown item types from normalized stream", () => {
    expect(mapCodexStreamEvent({
      type: "item.completed",
      item: { id: "x", type: "reasoning", text: "thinking" },
    })).toEqual([]);
  });
});
