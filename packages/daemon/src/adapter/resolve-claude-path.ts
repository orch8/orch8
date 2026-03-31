import { execSync } from "node:child_process";

let cached: string | null = null;

/** Resolve the absolute path to the `claude` CLI, caching the result. */
export function resolveClaudePath(): string {
  if (cached) return cached;
  try {
    cached = execSync("which claude", { encoding: "utf-8" }).trim();
  } catch {
    cached = "claude";
  }
  return cached;
}
