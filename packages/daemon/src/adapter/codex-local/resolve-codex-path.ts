import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

let cached: string | null = null;

export function resolveCodexPath(): string {
  if (cached && (cached === "codex" || existsSync(cached))) return cached;
  try {
    const resolved = execSync("which codex", { encoding: "utf-8" }).trim();
    cached = resolved || "codex";
  } catch {
    cached = "codex";
  }
  return cached;
}

export function __resetCodexPathCache(): void {
  cached = null;
}
