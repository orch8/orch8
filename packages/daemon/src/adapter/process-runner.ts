// packages/daemon/src/adapter/process-runner.ts
import type { ChildProcess } from "node:child_process";
import type { SpawnFn } from "../services/brainstorm.service.js";
import { parseOutputStream, detectError } from "./output-parser.js";
import { resolveBillingType } from "./env-builder.js";
import type { RunResult, RunErrorCode } from "./types.js";

export interface ProcessRunInput {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  prompt: string;
  timeoutSec: number;
  graceSec: number;
  logStream?: import("node:fs").WriteStream;
}

export async function runProcess(
  input: ProcessRunInput,
  spawnFn: SpawnFn,
): Promise<RunResult> {
  const proc = spawnFn(input.command, input.args, {
    cwd: input.cwd,
    env: input.env,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  }) as ChildProcess;

  // Write prompt to stdin and close (spec §2.1)
  proc.stdin!.write(input.prompt);
  proc.stdin!.end();

  // Collect stderr for error detection
  const stderrChunks: Buffer[] = [];
  proc.stderr!.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk);
  });

  // Tee stdout and stderr to log stream if provided (spec §14 §2.2)
  if (input.logStream) {
    proc.stdout!.on("data", (chunk: Buffer) => {
      input.logStream!.write(chunk);
    });
    proc.stderr!.on("data", (chunk: Buffer) => {
      input.logStream!.write(chunk);
    });
  }

  // Parse stdout
  const parsedOutputPromise = parseOutputStream(proc.stdout!);

  // Wait for process exit
  const exitPromise = new Promise<{ exitCode: number | null; signal: string | null }>(
    (resolve) => {
      proc.on("close", (code, signal) => {
        resolve({ exitCode: code, signal });
      });
    },
  );

  // Timeout handling (spec §2.2)
  let timedOut = false;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let graceTimer: ReturnType<typeof setTimeout> | null = null;

  if (input.timeoutSec > 0) {
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");

      graceTimer = setTimeout(() => {
        proc.kill("SIGKILL");
      }, input.graceSec * 1000);
    }, input.timeoutSec * 1000);
  }

  const [parsedOutput, exit] = await Promise.all([parsedOutputPromise, exitPromise]);

  // Clean up timers
  if (timeoutTimer) clearTimeout(timeoutTimer);
  if (graceTimer) clearTimeout(graceTimer);

  // Detect errors
  const stderrText = Buffer.concat(stderrChunks).toString();
  let errorCode: RunErrorCode | null = null;
  let error: string | null = null;

  if (timedOut) {
    errorCode = "timeout";
    error = `Process timed out after ${input.timeoutSec}s`;
  } else {
    // Check stderr and unparsed stdout lines for auth errors
    const combinedText = [stderrText, ...parsedOutput.unparsedLines].join("\n");
    errorCode = detectError(combinedText);
    if (errorCode) {
      error = combinedText.trim();
    } else if (exit.exitCode !== 0 && exit.exitCode !== null) {
      errorCode = "process_error";
      error = stderrText.trim() || `Process exited with code ${exit.exitCode}`;
    }
  }

  const billingType = resolveBillingType(input.env);

  return {
    sessionId: parsedOutput.sessionId,
    model: parsedOutput.model,
    result: parsedOutput.result,
    usage: parsedOutput.usage,
    costUsd: parsedOutput.costUsd,
    billingType,
    exitCode: exit.exitCode,
    signal: exit.signal,
    error,
    errorCode,
    events: parsedOutput.events,
  };
}
