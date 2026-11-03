import { describe, expect, it, vi } from "vitest";
import { CreateAgentSchema, UpdateAgentSchema } from "@orch/shared";
import { resolveAdapter, type AdapterMap } from "../../adapter/registry.js";
import type { AgentAdapter } from "../../adapter/types.js";

function adapters(): AdapterMap {
  const make = (type: string): AgentAdapter => ({
    type,
    capabilities: { requiresMaterializedRuntimeSkills: false, supportsInstructionsBundle: true },
    runAgent: vi.fn(), testEnvironment: vi.fn(),
  });
  return { claude_local: make("claude_local"), codex_local: make("codex_local") };
}

describe("adapter selection", () => {
  it.each(["claude_local", "codex_local"] as const)("resolves %s exactly", (type) => {
    const map = adapters();
    expect(resolveAdapter(type, map)).toBe(map[type]);
  });

  it.each([null, undefined])("defaults only absent legacy value %s to Claude", (type) => {
    const map = adapters();
    expect(resolveAdapter(type, map)).toBe(map.claude_local);
  });

  it.each(["unknown", "custom", "", " ", "Claude_local", " codex_local", "constructor", "toString", "__proto__"])(
    "rejects explicit unsupported value %j before execution", (type) => {
      const map = adapters();
      expect(() => resolveAdapter(type, map).runAgent({}, {} as never, {} as never))
        .toThrow(/Unsupported adapter type/);
      expect(map.claude_local.runAgent).not.toHaveBeenCalled();
      expect(map.codex_local.runAgent).not.toHaveBeenCalled();
    },
  );

  it("does not treat an extra registry property as a supported integration", () => {
    const map = { ...adapters(), custom: {} as AgentAdapter };
    expect(() => resolveAdapter("custom", map)).toThrow(/Unsupported adapter type/);
  });

  it.each(["claude_local", "codex_local", undefined])("preserves API schema compatibility for %s", (adapterType) => {
    expect(CreateAgentSchema.safeParse({ id: "a", projectId: "p", name: "A", role: "custom", adapterType }).success).toBe(true);
    expect(UpdateAgentSchema.safeParse({ adapterType }).success).toBe(true);
  });

  it.each(["unknown", "", "constructor", null])("rejects invalid explicit API value %j", (adapterType) => {
    expect(CreateAgentSchema.safeParse({ id: "a", projectId: "p", name: "A", role: "custom", adapterType }).success).toBe(false);
    expect(UpdateAgentSchema.safeParse({ adapterType }).success).toBe(false);
  });
});
