import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

let cached: string | null = null;

/**
 * Resolve the absolute path to the `claude` CLI.
 *
 * The previous implementation cached the path forever, so `which
 * claude` was never re-run even if the binary moved (e.g. user
 * upgraded the CLI to a new version in a different prefix, or
 * uninstalled the global and only a project-local install remained).
 * We now validate the cached path still exists on disk and re-resolve
 * when it doesn't; the cost of one `which` on cache-miss is
 * negligible compared to the surprise of launching a stale binary.
 */
export function resolveClaudePath(): string {
  if (cached && (cached === "claude" || existsSync(cached))) return cached;
  try {
    const resolved = execSync("which claude", { encoding: "utf-8" }).trim();
    cached = resolved || "claude";
  } catch {
    cached = "claude";
  }
  return cached;
}

/** @internal test-only: clear the memoized path so tests can re-exercise lookup. */
export function __resetClaudePathCache(): void {
  cached = null;
}
