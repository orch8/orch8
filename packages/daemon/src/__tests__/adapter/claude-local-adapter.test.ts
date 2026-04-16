// packages/daemon/src/__tests__/adapter/claude-local-adapter.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Writable, Readable } from "node:stream";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projects, agents, taskSessions } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "../helpers/test-db.js";
import { ClaudeLocalAdapter, type RunAgentInstructions } from "../../adapter/claude-local-adapter.js";
import type { RunContext, ClaudeLocalAdapterConfig, SpawnFn } from "../../adapter/types.js";

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
  let tempRoot: string;

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
    });
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  beforeEach(async () => {
    await testDb.db.delete(taskSessions);

    // Seed AGENTS.md on disk for the test agent
    tempRoot = mkdtempSync(join(tmpdir(), "adapter-test-"));
    const agentDir = join(tempRoot, ".orch8", "agents", "test-agent");
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(agentDir, "AGENTS.md"), "# Test Agent\n\nYou are a test agent.\n", "utf-8");
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

    const instructions: RunAgentInstructions = {
      projectRoot: tempRoot,
      slug: "test-agent",
      wake: { source: "on_demand", userMessage: "hello" },
    };

    const adapter = new ClaudeLocalAdapter(testDb.db, spawnFn as unknown as SpawnFn);
    const result = await adapter.runAgent(config, context, instructions);

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

    const instructions: RunAgentInstructions = {
      projectRoot: tempRoot,
      slug: "test-agent",
      wake: { source: "on_demand", userMessage: "do work" },
    };

    const adapter = new ClaudeLocalAdapter(testDb.db, spawnFn as unknown as SpawnFn);
    await adapter.runAgent(config, context, instructions);

    // Verify session was persisted
    const rows = await testDb.db.select().from(taskSessions);
    expect(rows).toHaveLength(1);
    expect(rows[0].sessionDisplayId).toBe("persist-sess");
  });

  it("rejects when AGENTS.md is missing", async () => {
    const agentDir = join(tempRoot, ".orch8", "agents", "test-agent");
    await rm(join(agentDir, "AGENTS.md"));

    const spawnFn = vi.fn(() => createMockProcess([]) as unknown as ReturnType<SpawnFn>);

    const config: ClaudeLocalAdapterConfig = {};
    const context: RunContext = {
      agentId: "test-agent",
      agentName: "Test Agent",
      projectId,
      runId: "run-missing",
      taskId: "task-missing",
      wakeReason: "assignment",
      apiUrl: "http://localhost:3847",
      cwd: "/tmp/adapt",
    };

    const instructions: RunAgentInstructions = {
      projectRoot: tempRoot,
      slug: "test-agent",
      wake: { source: "on_demand", userMessage: "hello" },
    };

    const adapter = new ClaudeLocalAdapter(testDb.db, spawnFn as unknown as SpawnFn);
    await expect(adapter.runAgent(config, context, instructions)).rejects.toThrow(/Missing AGENTS.md/);
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

    const instructions: RunAgentInstructions = {
      projectRoot: tempRoot,
      slug: "test-agent",
      wake: { source: "on_demand", userMessage: "first run" },
    };

    const adapter = new ClaudeLocalAdapter(testDb.db, spawnFn as unknown as SpawnFn);

    // First run — no session to resume
    await adapter.runAgent(config, context, instructions);
    const firstArgs = (spawnFn as ReturnType<typeof vi.fn>).mock.calls[0][1] as string[];
    expect(firstArgs).not.toContain("--resume");

    // Second run — should resume
    await adapter.runAgent(config, { ...context, runId: "run-4" }, {
      ...instructions,
      wake: { source: "on_demand", userMessage: "second run" },
    });
    const secondArgs = (spawnFn as ReturnType<typeof vi.fn>).mock.calls[1][1] as string[];
    expect(secondArgs).toContain("--resume");
    expect(secondArgs[secondArgs.indexOf("--resume") + 1]).toBe("sess-1");
  });
});

describe("ClaudeLocalAdapter skill resolution", () => {
  it("resolves desiredSkills slugs to sourceLocator paths", async () => {
    const { resolveSkillPaths } = await import("../../adapter/claude-local-adapter.js");

    const mockService = {
      get: vi.fn()
        .mockResolvedValueOnce({ sourceLocator: "/skills/alpha", slug: "alpha" })
        .mockResolvedValueOnce({ sourceLocator: "/skills/beta", slug: "beta" }),
    };

    const paths = await resolveSkillPaths(
      mockService as any,
      "proj-1",
      ["alpha", "beta"],
    );

    expect(paths).toEqual([
      "/skills/alpha/SKILL.md",
      "/skills/beta/SKILL.md",
    ]);
    expect(mockService.get).toHaveBeenCalledTimes(2);
  });

  it("falls back to skillPaths when desiredSkills is empty", async () => {
    const { resolveSkillPaths } = await import("../../adapter/claude-local-adapter.js");

    const mockService = { get: vi.fn() };
    const paths = await resolveSkillPaths(mockService as any, "proj-1", []);

    expect(paths).toEqual([]);
    expect(mockService.get).not.toHaveBeenCalled();
  });

  it("skips slugs that resolve to null (missing skills)", async () => {
    const { resolveSkillPaths } = await import("../../adapter/claude-local-adapter.js");

    const mockService = {
      get: vi.fn()
        .mockResolvedValueOnce({ sourceLocator: "/skills/good", slug: "good" })
        .mockResolvedValueOnce(null),
    };

    const paths = await resolveSkillPaths(mockService as any, "proj-1", ["good", "missing"]);
    expect(paths).toEqual(["/skills/good/SKILL.md"]);
  });
});
