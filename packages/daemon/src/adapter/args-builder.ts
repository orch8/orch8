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
    "--dangerously-skip-permissions",
    "--setting-sources", "project,local",
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

  if (config.extraArgs) {
    args.push(...config.extraArgs);
  }

  return args;
}
