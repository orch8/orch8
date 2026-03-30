import { spawn, type ChildProcess } from "node:child_process";

export interface SpawnConfig {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
}

export function spawnClaude(config: SpawnConfig): ChildProcess {
  const mergedEnv = { ...process.env, ...config.env };

  // Nesting guard removal (spec 04 §2.3)
  delete mergedEnv.CLAUDECODE;
  delete mergedEnv.CLAUDE_CODE_ENTRYPOINT;
  delete mergedEnv.CLAUDE_CODE_SESSION;
  delete mergedEnv.CLAUDE_CODE_PARENT_SESSION;

  return spawn(config.command, config.args, {
    cwd: config.cwd,
    env: mergedEnv,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
