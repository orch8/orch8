// packages/daemon/src/adapter/process-runner.ts
import type { ChildProcess } from "node:child_process";
import type { Writable } from "node:stream";
import type { SpawnFn } from "./types.js";
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
  onEvent?: (event: import("./types.js").StreamEvent) => void;
}

/**
 * Writes `text` to a writable stream, honouring backpressure. The native
 * `stream.write` returns `false` when the internal buffer has exceeded
 * the high-water mark; callers must wait for a `drain` event before
 * writing more to avoid silently dropping bytes on large payloads.
 *
 * We also listen for `error` so a broken pipe (e.g. the child exited
 * before we finished writing) rejects the promise instead of hanging.
 */
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
      if (err) {
        onError(err);
      }
      // Do nothing on success — resolution is driven by either the
      // synchronous `ok === true` path below or the `drain` listener.
    });

    if (ok) {
      // Fast path: chunk was accepted without hitting the high-water
      // mark, so we can resolve immediately.
      done();
    } else {
      // Buffer full — wait for drain before resolving.
      stdin.once("drain", done);
    }
  });
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

  // Collect stderr for error detection. Register synchronously so we
  // don't miss early error output that fires before we yield for the
  // stdin write.
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

  // Parse stdout. Must start the parser BEFORE we await the stdin
  // write — parseOutputStream attaches 'data'/'end' listeners
  // synchronously, and if we awaited first, a fast child process
  // could have already emitted output and closed the pipe by the
  // time we returned from the await.
  const parsedOutputPromise = parseOutputStream(proc.stdout!, input.onEvent);

  // Wait for process exit (registered before any await, same reason).
  const exitPromise = new Promise<{ exitCode: number | null; signal: string | null }>(
    (resolve) => {
      proc.on("close", (code, signal) => {
        resolve({ exitCode: code, signal });
      });
    },
  );

  // Write prompt to stdin and close (--print - reads from stdin).
  // Must await so large prompts that hit the high-water mark are not
  // silently dropped (spec §2.7). `writeAllToStdin` handles drain.
  await writeAllToStdin(proc.stdin!, input.prompt);
  proc.stdin!.end();

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
