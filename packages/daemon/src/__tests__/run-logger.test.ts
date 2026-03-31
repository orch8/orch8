import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { RunLogger } from "../services/run-logger.js";
import { mkdir, rm, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

describe("RunLogger", () => {
  let logDir: string;

  beforeEach(async () => {
    logDir = path.join(os.tmpdir(), `orch8-log-test-${randomUUID()}`);
    await mkdir(logDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(logDir, { recursive: true, force: true });
  });

  it("creates a writable stream and records log path", () => {
    const logger = new RunLogger(logDir);
    const handle = logger.create("run_abc123");

    expect(handle.logRef).toBe(path.join(logDir, "run_abc123.log"));
    expect(handle.stream).toBeDefined();
    expect(handle.stream.writable).toBe(true);
  });

  it("writes data to disk and returns byte count on finalize", async () => {
    const logger = new RunLogger(logDir);
    const handle = logger.create("run_abc123");

    handle.stream.write("stdout line 1\n");
    handle.stream.write("stderr line 2\n");

    const result = await logger.finalize(handle);

    expect(result.logStore).toBe("local");
    expect(result.logRef).toBe(path.join(logDir, "run_abc123.log"));
    expect(result.logBytes).toBeGreaterThan(0);
    expect(result.logExcerpt).toContain("stderr line 2");

    const content = await readFile(result.logRef, "utf-8");
    expect(content).toContain("stdout line 1");
    expect(content).toContain("stderr line 2");
  });

  it("excerpt contains last 20 lines", async () => {
    const logger = new RunLogger(logDir);
    const handle = logger.create("run_excerpt");

    for (let i = 1; i <= 50; i++) {
      handle.stream.write(`line ${i}\n`);
    }

    const result = await logger.finalize(handle);

    expect(result.logExcerpt).toContain("line 50");
    expect(result.logExcerpt).toContain("line 31");
    expect(result.logExcerpt).not.toContain("line 30\n");
  });

  it("handles empty log gracefully", async () => {
    const logger = new RunLogger(logDir);
    const handle = logger.create("run_empty");

    const result = await logger.finalize(handle);

    expect(result.logBytes).toBe(0);
    expect(result.logExcerpt).toBe("");
  });
});
