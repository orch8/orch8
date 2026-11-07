// packages/daemon/src/adapter/args-builder.ts
import type { ClaudeLocalAdapterConfig } from "./types.js";

export interface InjectedPaths {
  instructionsFilePath?: string;
  skillsDir?: string;
}

export function buildArgs(
  config: ClaudeLocalAdapterConfig,
  sessionId?: string,
  injected?: InjectedPaths,
): string[] {
  const args: string[] = [
    "--print", "-",
    "--output-format", "stream-json",
    "--verbose",
    // Print mode cannot ask for consent interactively. Respect only permissions
    // already granted by Claude's user/project/local settings; denied tools stay denied.
    "--permission-mode", "default",
    "--setting-sources", "user,project,local",
  ];

  if (config.model) {
    args.push("--model", config.model);
  }

  if (sessionId) {
    args.push("--resume", sessionId);
  }

  if (config.maxTurnsPerRun != null) {
    args.push("--max-turns", String(config.maxTurnsPerRun));
  }

  if (config.effort) {
    args.push("--effort", config.effort);
  }

  if (injected?.instructionsFilePath) {
    args.push("--append-system-prompt-file", injected.instructionsFilePath);
  }

  if (injected?.skillsDir) {
    args.push("--add-dir", injected.skillsDir);
  }

  if (config.chrome) {
    args.push("--chrome");
  }

  if (config.extraArgs?.some(arg => /^--(?:dangerously-skip-permissions|allow-dangerously-skip-permissions|permission-mode|allowedTools|allowed-tools|setting-sources|settings|bare|tools)(?:=|$)/.test(arg))) {
    throw new Error("Unsafe Claude permission or settings override in extraArgs");
  }
  if (config.extraArgs) {
    args.push(...config.extraArgs);
  }

  return args;
}
