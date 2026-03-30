// packages/daemon/src/__tests__/adapter/claude-local-adapter.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Writable, Readable } from "node:stream";
import { projects, agents, taskSessions } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "../helpers/test-db.js";
import { ClaudeLocalAdapter } from "../../adapter/claude-local-adapter.js";
import type { RunContext, ClaudeLocalAdapterConfig } from "../../adapter/types.js";
import type { SpawnFn } from "../../services/brainstorm.service.js";

function createMockProcess(lines: string[], exitCode = 0) {
  const stdin = new Writable({
    write(_chunk, _encoding, cb) { cb(); },
  });
  const stderr = new Readable({ read() {} });

  let emitted = false;
  const stdout = new Readable({
    read() {
      if (emitted) return;
      emitted = true;
      // Defer data push so readline has time to attach
      queueMicrotask(() => {
        for (const line of lines) {
          stdout.push(line + "\n");
        }
        stdout.push(null);
        stderr.push(null);
        proc.emit("close", exitCode, null);
      });
    },
  });

  const proc = Object.assign(new EventEmitter(), {
    stdin, stdout, stderr,
    pid: 12345,
    kill: vi.fn(() => { proc.emit("close", exitCode, null); return true; }),
  });

  return proc;
}

describe("ClaudeLocalAdapter", () => {
  let testDb: TestDb;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Adapter Test",
      slug: "adapter-test",
      homeDir: "/tmp/adapt",
      worktreeDir: "/tmp/adapt-wt",
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values({
      id: "test-agent",
      projectId,
      name: "Test Agent",
      role: "engineer",
      promptTemplate: "Work on: {{task.title}}",
      bootstrapPromptTemplate: "You are {{agent.name}}.",
    });
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(taskSessions);
  });

  it("runs an agent and returns session + result", async () => {
    const initEvent = JSON.stringify({
      type: "system", subtype: "init", session_id: "new-sess", model: "claude-sonnet-4-6",
    });
    const resultEvent = JSON.stringify({
      type: "result", session_id: "new-sess", result: "Bug fixed",
      model: "claude-sonnet-4-6",
      usage: { input_tokens: 200, output_tokens: 100 },
      total_cost_usd: 0.02,
    });

    const mockProc = createMockProcess([initEvent, resultEvent]);
    const spawnFn = vi.fn(() => mockProc as unknown as ReturnType<SpawnFn>);

    const config: ClaudeLocalAdapterConfig = {
      model: "claude-sonnet-4-6",
      maxTurnsPerRun: 25,
    };

    const context: RunContext = {
      agentId: "test-agent",
      agentName: "Test Agent",
      projectId,
      runId: "run-1",
      taskId: "task-1",
      wakeReason: "assignment",
      apiUrl: "http://localhost:3847",
      cwd: "/tmp/adapt",
      taskTitle: "Fix login",
    };

    const adapter = new ClaudeLocalAdapter(testDb.db, spawnFn as unknown as SpawnFn);
    const result = await adapter.runAgent(config, context, {
      heartbeatTemplate: "Work on: {{task.title}}",
    });

    expect(result.sessionId).toBe("new-sess");
    expect(result.result).toBe("Bug fixed");
    expect(result.costUsd).toBe(0.02);
  });

  it("persists session after successful run", async () => {
    const initEvent = JSON.stringify({
      type: "system", subtype: "init", session_id: "persist-sess", model: "claude-sonnet-4-6",
    });
    const resultEvent = JSON.stringify({
      type: "result", session_id: "persist-sess", result: "Done",
      model: "claude-sonnet-4-6",
      usage: { input_tokens: 10, output_tokens: 5 },
      total_cost_usd: 0.001,
    });

    const mockProc = createMockProcess([initEvent, resultEvent]);
    const spawnFn = vi.fn(() => mockProc as unknown as ReturnType<SpawnFn>);

    const config: ClaudeLocalAdapterConfig = {};
    const context: RunContext = {
      agentId: "test-agent",
      agentName: "Test Agent",
      projectId,
      runId: "run-2",
      taskId: "task-2",
      wakeReason: "assignment",
      apiUrl: "http://localhost:3847",
      cwd: "/tmp/adapt",
    };

    const adapter = new ClaudeLocalAdapter(testDb.db, spawnFn as unknown as SpawnFn);
    await adapter.runAgent(config, context, {
      heartbeatTemplate: "Do work.",
    });

    // Verify session was persisted
    const rows = await testDb.db.select().from(taskSessions);
    expect(rows).toHaveLength(1);
    expect(rows[0].sessionDisplayId).toBe("persist-sess");
  });

  it("resumes session on second run to same task", async () => {
    const makeLines = (sessId: string) => [
      JSON.stringify({ type: "system", subtype: "init", session_id: sessId, model: "claude-sonnet-4-6" }),
      JSON.stringify({ type: "result", session_id: sessId, result: "OK", model: "claude-sonnet-4-6", usage: { input_tokens: 10, output_tokens: 5 }, total_cost_usd: 0.001 }),
    ];

    let callCount = 0;
    const spawnFn = vi.fn(() => {
      callCount++;
      const proc = createMockProcess(makeLines(`sess-${callCount}`));
      return proc as unknown as ReturnType<SpawnFn>;
    });

    const config: ClaudeLocalAdapterConfig = {};
    const context: RunContext = {
      agentId: "test-agent",
      agentName: "Test Agent",
      projectId,
      runId: "run-3",
      taskId: "task-3",
      wakeReason: "assignment",
      apiUrl: "http://localhost:3847",
      cwd: "/tmp/adapt",
    };

    const adapter = new ClaudeLocalAdapter(testDb.db, spawnFn as unknown as SpawnFn);

    // First run — no session to resume
    await adapter.runAgent(config, context, { heartbeatTemplate: "First run." });
    const firstArgs = (spawnFn as ReturnType<typeof vi.fn>).mock.calls[0][1] as string[];
    expect(firstArgs).not.toContain("--resume");

    // Second run — should resume
    await adapter.runAgent(config, { ...context, runId: "run-4" }, { heartbeatTemplate: "Second run." });
    const secondArgs = (spawnFn as ReturnType<typeof vi.fn>).mock.calls[1][1] as string[];
    expect(secondArgs).toContain("--resume");
    expect(secondArgs[secondArgs.indexOf("--resume") + 1]).toBe("sess-1");
  });

  it("passes bootstrap template only on first run", async () => {
    const makeLines = (sessId: string) => [
      JSON.stringify({ type: "system", subtype: "init", session_id: sessId, model: "claude-sonnet-4-6" }),
      JSON.stringify({ type: "result", session_id: sessId, result: "OK", model: "claude-sonnet-4-6", usage: { input_tokens: 10, output_tokens: 5 }, total_cost_usd: 0.001 }),
    ];

    let writtenPrompts: string[] = [];
    let callCount = 0;

    const spawnFn = vi.fn(() => {
      callCount++;
      const stdin = new Writable({
        write(chunk, _enc, cb) { writtenPrompts.push(chunk.toString()); cb(); },
      });
      const stdout = new Readable({ read() {} });
      const stderr = new Readable({ read() {} });
      const proc = Object.assign(new EventEmitter(), {
        stdin, stdout, stderr,
        pid: 12345,
        kill: vi.fn(() => { proc.emit("close", 0, null); return true; }),
      });

      queueMicrotask(() => {
        for (const line of makeLines(`sess-${callCount}`)) {
          stdout.push(line + "\n");
        }
        stdout.push(null);
        stderr.push(null);
        proc.emit("close", 0, null);
      });

      return proc as unknown as ReturnType<SpawnFn>;
    });

    const config: ClaudeLocalAdapterConfig = {};
    const context: RunContext = {
      agentId: "test-agent",
      agentName: "Test Agent",
      projectId,
      runId: "run-5",
      taskId: "task-5",
      wakeReason: "assignment",
      apiUrl: "http://localhost:3847",
      cwd: "/tmp/adapt",
    };

    const adapter = new ClaudeLocalAdapter(testDb.db, spawnFn as unknown as SpawnFn);

    // First run — should include bootstrap
    await adapter.runAgent(config, context, {
      heartbeatTemplate: "Do work.",
      bootstrapTemplate: "BOOTSTRAP",
    });
    expect(writtenPrompts[0]).toContain("BOOTSTRAP");

    // Second run — should NOT include bootstrap
    writtenPrompts = [];
    await adapter.runAgent(config, { ...context, runId: "run-6" }, {
      heartbeatTemplate: "Continue work.",
      bootstrapTemplate: "BOOTSTRAP",
    });
    expect(writtenPrompts[0]).not.toContain("BOOTSTRAP");
  });
});
