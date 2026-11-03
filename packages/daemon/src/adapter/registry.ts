import type { AdapterType } from "@orch/shared";
import type { AgentAdapter } from "./types.js";

export type AdapterMap = Record<AdapterType, AgentAdapter>;

export function resolveAdapter(
  type: string | null | undefined,
  adapters: AdapterMap,
  logger?: { warn: (obj: unknown, msg: string) => void },
): AgentAdapter {
  // Only absent legacy values use the default. Empty or misspelled explicit
  // values must not silently select a different execution provider.
  if (type === null || type === undefined) {
    return adapters.claude_local;
  }

  // Check supported names, not object membership (which includes prototypes).
  if (type === "claude_local" || type === "codex_local") {
    return adapters[type];
  }

  logger?.warn({ type }, "Unsupported adapter type");
  throw new Error(`Unsupported adapter type: ${JSON.stringify(type)}`);
}
