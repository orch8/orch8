export const DEFAULT_PORT = 3847;
export const DEFAULT_HOST = "localhost";

export const ADAPTER_TYPES = ["claude_local", "codex_local"] as const;
export type AdapterType = (typeof ADAPTER_TYPES)[number];
