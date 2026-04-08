// packages/daemon/src/__tests__/adapter/process-runner.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { Writable, Readable } from "node:stream";
import { runProcess, type ProcessRunInput } from "../../adapter/process-runner.js";
import type { SpawnFn } from "../../adapter/types.js";

function createMockProcess(lines: string[] = [], exitCode = 0) {
  const stdin = new Writable({
    write(_chunk, _encoding, cb) { cb(); },
  });
  const stdoutReadable = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const proc = Object.assign(new EventEmitter(), {
    stdin,
    stdout: stdoutReadable,
    stderr,
    pid: 99999,
    kill: vi.fn(() => { proc.emit("close", exitCode, null); return true; }),
  });

  // Push lines after a microtask to simulate async output
  queueMicrotask(() => {
    for (const line of lines) {
      stdoutReadable.push(line + "\n");
    }
    stdoutReadable.push(null); // EOF
    proc.emit("close", exitCode, null);
  });

  return proc;
}

function makeInput(overrides: Partial<ProcessRunInput> = {}): ProcessRunInput {
  return {
    command: "claude",
    args: ["--print", "-", "--output-format", "stream-json", "--verbose"],
    cwd: "/tmp/test",
    env: {},
    prompt: "Hello agent",
    timeoutSec: 0,
    graceSec: 20,
    ...overrides,
  };
}

describe("runProcess", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes prompt to stdin and closes it", async () => {
    const initEvent = JSON.stringify({ type: "system", subtype: "init", session_id: "s1", model: "claude-sonnet-4-6" });
    const resultEvent = JSON.stringify({ type: "result", session_id: "s1", result: "Done", model: "claude-sonnet-4-6", usage: { input_tokens: 100, output_tokens: 50 }, total_cost_usd: 0.01 });

    const mockProc = createMockProcess([initEvent, resultEvent]);
    const writeSpy = vi.spyOn(mockProc.stdin, "write");
    const endSpy = vi.spyOn(mockProc.stdin, "end");

    const spawnFn = vi.fn(() => mockProc as unknown as ReturnType<SpawnFn>);
    const input = makeInput();

    await runProcess(input, spawnFn as unknown as SpawnFn);

    expect(writeSpy).toHaveBeenCalledTimes(1);
    // First arg is the prompt; second is the write callback used
    // by writeAllToStdin to detect errors.
    expect(writeSpy.mock.calls[0][0]).toBe("Hello agent");
    expect(typeof writeSpy.mock.calls[0][1]).toBe("function");
    expect(endSpy).toHaveBeenCalled();
  });

  it("spawns with correct args and options", async () => {
    const initEvent = JSON.stringify({ type: "system", subtype: "init", session_id: "s1", model: "claude-sonnet-4-6" });
    const resultEvent = JSON.stringify({ type: "result", session_id: "s1", result: "Done", model: "claude-sonnet-4-6", usage: { input_tokens: 10, output_tokens: 5 }, total_cost_usd: 0.001 });

    const mockProc = createMockProcess([initEvent, resultEvent]);
    const spawnFn = vi.fn(() => mockProc as unknown as ReturnType<SpawnFn>);

    const input = makeInput({
      command: "claude",
      args: ["--print", "-"],
      cwd: "/my/dir",
      env: { FOO: "bar" },
    });

    await runProcess(input, spawnFn as unknown as SpawnFn);

    expect(spawnFn).toHaveBeenCalledWith("claude", ["--print", "-"], {
      cwd: "/my/dir",
      env: { FOO: "bar" },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
  });

  it("returns parsed output with session and cost data", async () => {
    const initEvent = JSON.stringify({ type: "system", subtype: "init", session_id: "sess-42", model: "claude-opus-4-6" });
    const resultEvent = JSON.stringify({ type: "result", session_id: "sess-42", result: "All done", model: "claude-opus-4-6", usage: { input_tokens: 500, output_tokens: 200 }, total_cost_usd: 0.03 });

    const mockProc = createMockProcess([initEvent, resultEvent]);
    const spawnFn = vi.fn(() => mockProc as unknown as ReturnType<SpawnFn>);

    const result = await runProcess(makeInput(), spawnFn as unknown as SpawnFn);

    expect(result.sessionId).toBe("sess-42");
    expect(result.model).toBe("claude-opus-4-6");
    expect(result.result).toBe("All done");
    expect(result.costUsd).toBe(0.03);
    expect(result.exitCode).toBe(0);
  });

  it("captures exit code on failure", async () => {
    const mockProc = createMockProcess([], 1);
    const spawnFn = vi.fn(() => mockProc as unknown as ReturnType<SpawnFn>);

    const result = await runProcess(makeInput(), spawnFn as unknown as SpawnFn);

    expect(result.exitCode).toBe(1);
  });

  it("detects auth error from stderr", async () => {
    const stdin = new Writable({ write(_c, _e, cb) { cb(); } });
    const stdout = new Readable({ read() {} });
    const stderr = new Readable({ read() {} });
    const proc = Object.assign(new EventEmitter(), {
      stdin, stdout, stderr,
      pid: 99999,
      kill: vi.fn(() => true),
    });

    const spawnFn = vi.fn(() => proc as unknown as ReturnType<SpawnFn>);

    const promise = runProcess(makeInput(), spawnFn as unknown as SpawnFn);

    queueMicrotask(() => {
      stderr.push("Error: not logged in. Please run `claude login`.\n");
      stderr.push(null);
      stdout.push(null);
      proc.emit("close", 1, null);
    });

    const result = await promise;
    expect(result.errorCode).toBe("auth_required");
  });

  it("awaits stdin.write when backpressure is signalled (drain)", async () => {
    // Craft a stdin mock whose `write` returns false (high-water mark
    // reached) and only emits drain on our cue. The run must not
    // resolve until drain fires, proving we honour backpressure.
    const initEvent = JSON.stringify({ type: "system", subtype: "init", session_id: "sb", model: "claude-sonnet-4-6" });
    const resultEvent = JSON.stringify({ type: "result", session_id: "sb", result: "ok", model: "claude-sonnet-4-6", usage: { input_tokens: 1, output_tokens: 1 }, total_cost_usd: 0 });

    const stdinEmitter = new EventEmitter();
    let drainAllowed = false;
    const writeCalls: unknown[] = [];
    const stdinMock = Object.assign(stdinEmitter, {
      write: vi.fn((chunk: string | Buffer, cb?: (err?: Error | null) => void) => {
        writeCalls.push(chunk);
        // Fire the write callback asynchronously so it matches real
        // Node semantics, but do NOT fire drain until the test says so.
        queueMicrotask(() => {
          if (cb) cb(null);
          if (drainAllowed) stdinEmitter.emit("drain");
        });
        return false; // signal backpressure
      }),
      end: vi.fn(),
      once: stdinEmitter.once.bind(stdinEmitter),
      on: stdinEmitter.on.bind(stdinEmitter),
      removeListener: stdinEmitter.removeListener.bind(stdinEmitter),
    });

    const stdoutReadable = new Readable({ read() {} });
    const stderrReadable = new Readable({ read() {} });
    const proc = Object.assign(new EventEmitter(), {
      stdin: stdinMock,
      stdout: stdoutReadable,
      stderr: stderrReadable,
      pid: 42,
      kill: vi.fn(() => true),
    });

    // Stream the output lines only AFTER drain allows writeAllToStdin
    // to resolve — if the fix is missing, runProcess will proceed
    // immediately and we can't distinguish it from correct behavior.
    // So instead we arm a flag and observe that runProcess is still
    // pending until we set it.
    const spawnFn = vi.fn(() => proc as unknown as ReturnType<SpawnFn>);

    const runPromise = runProcess(makeInput({ prompt: "x".repeat(10_000) }), spawnFn as unknown as SpawnFn);

    // Yield several microtasks so any un-awaited paths would have
    // resolved by now. (If runProcess forgot to await the write, it
    // would be pushing output through stdout by now.)
    let settled = false;
    void runPromise.then(
      () => { settled = true; },
      () => { settled = true; },
    );
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(settled).toBe(false);

    // Release drain. The promise must now be able to progress.
    drainAllowed = true;
    stdinEmitter.emit("drain");

    // Push output and close the process to let the rest of runProcess finish.
    queueMicrotask(() => {
      stdoutReadable.push(initEvent + "\n");
      stdoutReadable.push(resultEvent + "\n");
      stdoutReadable.push(null);
      stderrReadable.push(null);
      proc.emit("close", 0, null);
    });

    const result = await runPromise;
    expect(result.exitCode).toBe(0);
    expect(writeCalls).toHaveLength(1);
    expect(stdinMock.end).toHaveBeenCalled();
  });

  it("applies timeout and kills process", async () => {
    vi.useFakeTimers();

    const stdin = new Writable({ write(_c, _e, cb) { cb(); } });
    const stdout = new Readable({ read() {} });
    const stderr = new Readable({ read() {} });
    const proc = Object.assign(new EventEmitter(), {
      stdin, stdout, stderr,
      pid: 99999,
      kill: vi.fn((sig: string) => {
        if (sig === "SIGKILL") {
          stdout.push(null);
          stderr.push(null);
          proc.emit("close", null, "SIGKILL");
        }
        return true;
      }),
    });

    const spawnFn = vi.fn(() => proc as unknown as ReturnType<SpawnFn>);
    const input = makeInput({ timeoutSec: 5, graceSec: 2 });

    const promise = runProcess(input, spawnFn as unknown as SpawnFn);

    // Fast-forward past timeout
    await vi.advanceTimersByTimeAsync(5000);
    expect(proc.kill).toHaveBeenCalledWith("SIGTERM");

    // Fast-forward past grace period
    await vi.advanceTimersByTimeAsync(2000);
    expect(proc.kill).toHaveBeenCalledWith("SIGKILL");

    const result = await promise;
    expect(result.errorCode).toBe("timeout");

    vi.useRealTimers();
  });
});
