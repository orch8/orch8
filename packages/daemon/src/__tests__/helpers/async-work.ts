import { afterEach, beforeEach, expect, vi } from "vitest";

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

/** One owner releases gates, drains, restores interception, then closes resources. */
export function createAsyncWork(target: any, method: string, close: () => void | Promise<void> = () => {}) {
  const work = trackAsyncMethod(target, method);
  const releases: (() => void)[] = [];
  const errors: unknown[][] = [];
  const record = (...args: unknown[]) => { errors.push(args); };
  const logger = {
    error: record, warn: record,
    info() {}, debug() {}, trace() {}, fatal: record,
  } as unknown as import("fastify").FastifyBaseLogger;
  const errorLogger = { async record(value: unknown) { record(value); } };
  async function drain() {
    await work.drain();
    if (errors.length) {
      const records = errors.splice(0);
      throw new Error(`Unexpected service errors: ${JSON.stringify(records)}`);
    }
  }
  return {
    drain, logger, errorLogger,
    get pendingCount() { return work.pendingCount; },
    async cleanup() {
      for (const release of releases.splice(0)) release();
      try {
        await drain();
        expect(work.pendingCount).toBe(0);
      } finally {
        try { work.restore(); } finally { await close(); }
      }
    },
    gate() {
      const entered = deferred();
      const release = deferred();
      releases.push(release.resolve);
      return {
        entered: entered.promise,
        release: release.resolve,
        async hold() { entered.resolve(); await release.promise; },
      };
    },
  };
}

export function useAsyncWork(target: any, method: string, close?: () => void | Promise<void>) {
  let work: ReturnType<typeof createAsyncWork>;
  beforeEach(() => { work = createAsyncWork(target, method, close); });
  afterEach(() => work.cleanup());
  return {
    drain: () => work.drain(),
    gate: () => work.gate(),
    get logger() { return work.logger; },
    get errorLogger() { return work.errorLogger; },
    get pendingCount() { return work.pendingCount; },
  };
}

/** Prove a streaming placeholder does not satisfy the completion boundary. */
export async function finishHeldChatTurn(
  work: ReturnType<typeof useAsyncWork>,
  gate: ReturnType<ReturnType<typeof useAsyncWork>["gate"]>,
  readMessages: () => Promise<{ role: string; status: string; content: string; cards: unknown }[]>,
  index: number,
) {
  await gate.entered;
  let finished = false;
  const completion = work.drain().then(() => { finished = true; });
  try {
    const rows = await readMessages();
    expect(rows[index].role).toBe("assistant");
    expect(rows[index].status).toBe("streaming");
    expect(rows[index].content).toBe("");
    expect(rows[index].cards).toEqual([]);
    expect(finished).toBe(false);
  } finally {
    gate.release();
    await completion;
  }
  expect((await readMessages())[index].status).toBe("complete");
}

/** Capture real method promises, including calls on every service instance. */
export function trackAsyncMethod(target: any, method: string) {
  const pending = new Set<Promise<unknown>>();
  const failures: unknown[] = [];
  const original = target[method];
  const spy = vi.spyOn(target, method).mockImplementation(function (this: unknown, ...args: unknown[]) {
    const promise = original.apply(this, args) as Promise<unknown>;
    pending.add(promise);
    void promise.then(
      () => { pending.delete(promise); },
      (error) => { pending.delete(promise); failures.push(error); },
    );
    return promise;
  });
  return {
    get pendingCount() { return pending.size; },
    async drain() {
      // executeRun can start another execution during its final cleanup.
      while (pending.size > 0) await Promise.allSettled([...pending]);
      if (failures.length > 0) throw failures.shift();
    },
    restore() { spy.mockRestore(); },
  };
}
