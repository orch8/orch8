import Fastify from "fastify";
import { expect, it, vi } from "vitest";
import { deferred, trackAsyncMethod, createAsyncWork } from "./helpers/async-work.js";

it.each([false, true])("cleanup owns held work after assertion failure, rejected=%s", async (reject) => {
  const failure = new Error("rejected work");
  const worker = { async run() { await gate.hold(); if (reject) throw failure; } };
  const original = worker.run;
  const app = Fastify();
  const closed = vi.fn();
  app.addHook("onClose", async () => { closed(); });
  await app.ready();
  const work = createAsyncWork(worker, "run", async () => {
    expect(work.pendingCount).toBe(0);
    expect(worker.run).toBe(original);
    await app.close();
  });
  const gate = work.gate();
  void worker.run().catch(() => {});
  await gate.entered;
  const scenario = async () => {
    try {
      // Fail before a finish helper or local gate-release finally is reached.
      expect("actual").toBe("expected");
    } finally {
      await work.cleanup();
    }
  };
  await expect(scenario()).rejects.toThrow(reject ? failure.message : "expected");
  expect(work.pendingCount).toBe(0);
  expect(worker.run).toBe(original);
  expect(closed).toHaveBeenCalledTimes(1);
  await expect(app.inject({ method: "GET", url: "/" })).rejects.toThrow();
});

it("drain waits for late cleanup after terminal state across instances and newly spawned work", async () => {
  const terminal = deferred();
  const cleanup = deferred();
  const childEntered = deferred();
  const childCleanup = deferred();
  class Worker {
    async run(child = false): Promise<void> {
      if (child) {
        childEntered.resolve();
        await childCleanup.promise;
      } else {
        terminal.resolve();
        await cleanup.promise;
        void new Worker().run(true);
      }
    }
  }
  const work = trackAsyncMethod(Worker.prototype, "run");
  let drained = false;
  try {
    void new Worker().run();
    await terminal.promise;
    const draining = work.drain().then(() => { drained = true; });
    // A microtask checkpoint, not a timer or elapsed-time assumption.
    await Promise.resolve();
    expect(drained).toBe(false);
    expect(work.pendingCount).toBe(1);
    cleanup.resolve();
    await childEntered.promise;
    await Promise.resolve();
    expect(drained).toBe(false);
    childCleanup.resolve();
    await draining;
    expect(drained).toBe(true);
    expect(work.pendingCount).toBe(0);
  } finally {
    cleanup.resolve();
    childCleanup.resolve();
    try { await work.drain(); } finally { work.restore(); }
  }
});

it("drain reports rejected background work instead of silently accepting it", async () => {
  const failure = new Error("background cleanup failed");
  const worker = { async run() { throw failure; } };
  const work = trackAsyncMethod(worker, "run");
  try {
    void worker.run().catch(() => {});
    await expect(work.drain()).rejects.toThrow("background cleanup failed");
    expect(work.pendingCount).toBe(0);
  } finally {
    work.restore();
  }
});
