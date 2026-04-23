import type { ChildProcess } from "node:child_process";
import type { Writable } from "node:stream";
import type { RuntimeStreamEvent, RunErrorCode, RunResult, SpawnFn } from "../types.js";
import { parseCodexJsonl, detectCodexError } from "./parse.js";
import { resolveCodexBillingType } from "./env-builder.js";

export interface CodexProcessRunInput {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  prompt: string;
  timeoutSec: number;
  graceSec: number;
  logStream?: import("node:fs").WriteStream;
  onEvent?: (event: RuntimeStreamEvent) => void;
}

async function writeAllToStdin(stdin: Writable, text: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const onError = (err: Error) => {
      if (settled) return;
      settled = true;
      stdin.removeListener("error", onError);
      reject(err);
    };
    const done = () => {
      if (settled) return;
      settled = true;
      stdin.removeListener("error", onError);
      resolve();
    };
    stdin.once("error", onError);

    const ok = stdin.write(text, (err) => {
      if (err) onError(err);
    });
    if (ok) done();
    else stdin.once("drain", done);
  });
}

export async function runCodexProcess(
  input: CodexProcessRunInput,
  spawnFn: SpawnFn,
): Promise<RunResult> {
  const proc = spawnFn(input.command, input.args, {
    cwd: input.cwd,
    env: input.env,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  }) as ChildProcess;

  const stderrChunks: Buffer[] = [];
  proc.stderr!.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk);
  });

  if (input.logStream) {
    proc.stdout!.on("data", (chunk: Buffer) => input.logStream!.write(chunk));
    proc.stderr!.on("data", (chunk: Buffer) => input.logStream!.write(chunk));
  }

  const parsedOutputPromise = parseCodexJsonl(proc.stdout!, input.onEvent);
  const exitPromise = new Promise<{ exitCode: number | null; signal: string | null }>((resolve) => {
    proc.on("close", (code, signal) => resolve({ exitCode: code, signal }));
  });

  await writeAllToStdin(proc.stdin!, input.prompt);
  proc.stdin!.end();

  let timedOut = false;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let graceTimer: ReturnType<typeof setTimeout> | null = null;

  if (input.timeoutSec > 0) {
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
      graceTimer = setTimeout(() => proc.kill("SIGKILL"), input.graceSec * 1000);
    }, input.timeoutSec * 1000);
  }

  const [parsedOutput, exit] = await Promise.all([parsedOutputPromise, exitPromise]);

  if (timeoutTimer) clearTimeout(timeoutTimer);
  if (graceTimer) clearTimeout(graceTimer);

  const stderrText = Buffer.concat(stderrChunks).toString();
  let errorCode: RunErrorCode | null = null;
  let error: string | null = null;

  if (timedOut) {
    errorCode = "timeout";
    error = `Process timed out after ${input.timeoutSec}s`;
  } else {
    const combinedText = [stderrText, ...parsedOutput.unparsedLines].join("\n");
    errorCode = detectCodexError(combinedText)
      ?? parsedOutput.events.find((event) => event.kind === "error")?.errorCode
      ?? null;
    if (errorCode) {
      error = combinedText.trim()
        || parsedOutput.events.find((event) => event.kind === "error")?.message
        || null;
    } else if (exit.exitCode !== 0 && exit.exitCode !== null) {
      errorCode = "process_error";
      error = stderrText.trim() || `Process exited with code ${exit.exitCode}`;
    }
  }

  return {
    sessionId: parsedOutput.sessionId,
    model: null,
    result: parsedOutput.result,
    usage: parsedOutput.usage,
    costUsd: null,
    billingType: resolveCodexBillingType(input.env),
    exitCode: exit.exitCode,
    signal: exit.signal,
    error,
    errorCode,
    events: parsedOutput.events,
  };
}
