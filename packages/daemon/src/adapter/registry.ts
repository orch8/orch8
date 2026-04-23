import type { AdapterType } from "@orch/shared";
import type { AgentAdapter } from "./types.js";

export type AdapterMap = Record<AdapterType, AgentAdapter>;

export function resolveAdapter(
  type: string | null | undefined,
  adapters: AdapterMap,
  logger?: { warn: (obj: unknown, msg: string) => void },
): AgentAdapter {
  if (type && type in adapters) {
    return adapters[type as AdapterType];
  }

  if (type) {
    logger?.warn({ type }, "Unknown adapterType, falling back to claude_local");
  }

  return adapters.claude_local;
}
