import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Writable, Readable } from "node:stream";
import { projects, tasks, agents } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { BrainstormService, type SpawnFn } from "../services/brainstorm.service.js";

function createMockProcess() {
  const stdin = new Writable({
    write(_chunk, _encoding, callback) { callback(); },
  });
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const proc = Object.assign(new EventEmitter(), {
    stdin,
    stdout,
    stderr,
    pid: 12345,
    kill: vi.fn(() => { proc.emit("close", 0, null); return true; }),
  });
  return proc;
}

describe("BrainstormService", () => {
  let testDb: TestDb;
  let service: BrainstormService;
  let projectId: string;
  let mockSpawn: SpawnFn;
  let lastMockProcess: ReturnType<typeof createMockProcess>;
  const broadcasts: unknown[] = [];

  beforeAll(async () => {
    testDb = await setupTestDb();

    mockSpawn = vi.fn(() => {
      lastMockProcess = createMockProcess();
      return lastMockProcess as unknown as ReturnType<SpawnFn>;
    }) as unknown as SpawnFn;

    service = new BrainstormService(
      testDb.db,
      (_projectId, msg) => { broadcasts.push(msg); },
      mockSpawn,
    );

    const [project] = await testDb.db.insert(projects).values({
      name: "Brainstorm Test",
      slug: "brainstorm-test",
      homeDir: "/tmp/bs",
      worktreeDir: "/tmp/bs-wt",
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values({
      id: "bs-agent",
      projectId,
      name: "Brainstorm Agent",
      role: "custom",
    });
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    broadcasts.length = 0;
    await testDb.db.delete(tasks);
  });

  describe("startSession", () => {
    it("spawns a process and tracks the session", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Brainstorm session",
        taskType: "brainstorm",
        brainstormStatus: "active",
        assignee: "bs-agent",
      }).returning();

      await service.startSession(task.id, "/tmp/bs");

      expect(mockSpawn).toHaveBeenCalled();
      expect(service.hasActiveSession(task.id)).toBe(true);
    });

    it("passes prompt as --print argument, not via stdin", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Brainstorm prompt test",
        description: "Discuss project architecture",
        taskType: "brainstorm",
        brainstormStatus: "active",
        assignee: "bs-agent",
      }).returning();

      await service.startSession(task.id, "/tmp/bs");

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(["--print", "Discuss project architecture"]),
        expect.any(Object),
      );
    });

    it("updates task with session PID", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "BS2",
        taskType: "brainstorm",
        brainstormStatus: "active",
        assignee: "bs-agent",
      }).returning();

      await service.startSession(task.id, "/tmp/bs");

      const updated = await testDb.db.select().from(tasks).where(
        (await import("drizzle-orm")).eq(tasks.id, task.id),
      );
      expect(updated[0].brainstormSessionPid).toBe(12345);
    });

    it("throws if session already exists", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "BS3",
        taskType: "brainstorm",
        brainstormStatus: "active",
        assignee: "bs-agent",
      }).returning();

      await service.startSession(task.id, "/tmp/bs");

      await expect(
        service.startSession(task.id, "/tmp/bs")
      ).rejects.toThrow("already has an active session");
    });
  });

  describe("sendMessage", () => {
    it("spawns a new --continue process for follow-up messages", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "BS msg",
        taskType: "brainstorm",
        brainstormStatus: "active",
        assignee: "bs-agent",
      }).returning();

      const callsBefore = (mockSpawn as ReturnType<typeof vi.fn>).mock.calls.length;
      await service.startSession(task.id, "/tmp/bs");

      // Simulate the first turn completing so sendMessage can proceed
      lastMockProcess.emit("close", 0, null);

      await service.sendMessage(task.id, "Hello agent");

      // Two new spawn calls: initial turn + follow-up
      const newCalls = (mockSpawn as ReturnType<typeof vi.fn>).mock.calls.slice(callsBefore);
      expect(newCalls).toHaveLength(2);
      expect(newCalls[1][1]).toContain("--continue");
      expect(newCalls[1][1]).toContain("Hello agent");
    });

    it("rejects if previous turn is still running", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "BS busy",
        taskType: "brainstorm",
        brainstormStatus: "active",
        assignee: "bs-agent",
      }).returning();

      await service.startSession(task.id, "/tmp/bs");

      // Don't emit close — turn is still in-flight
      await expect(
        service.sendMessage(task.id, "Hello agent")
      ).rejects.toThrow("still processing");
    });

    it("throws if no active session", async () => {
      await expect(
        service.sendMessage("task_none", "Hi")
      ).rejects.toThrow("No active brainstorm session");
    });
  });

  describe("markReady", () => {
    it("kills process, stores transcript, updates task", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "BS ready",
        taskType: "brainstorm",
        brainstormStatus: "active",
        assignee: "bs-agent",
      }).returning();

      await service.startSession(task.id, "/tmp/bs");
      // Simulate first turn completing
      lastMockProcess.emit("close", 0, null);
      await service.sendMessage(task.id, "Let's discuss");
      await service.markReady(task.id);

      expect(lastMockProcess.kill).toHaveBeenCalled();
      expect(service.hasActiveSession(task.id)).toBe(false);

      const updated = await testDb.db.select().from(tasks).where(
        (await import("drizzle-orm")).eq(tasks.id, task.id),
      );
      expect(updated[0].brainstormStatus).toBe("ready");
      expect(updated[0].brainstormSessionPid).toBeNull();
    });
  });

  describe("stream-json parsing", () => {
    it("extracts only assistant text from stream-json output", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "BS parse",
        taskType: "brainstorm",
        brainstormStatus: "active",
        assignee: "bs-agent",
      }).returning();

      await service.startSession(task.id, "/tmp/bs");
      broadcasts.length = 0;

      // Simulate stream-json output: system events, thinking, text, tool_use, result
      const lines = [
        JSON.stringify({ type: "system", subtype: "init", cwd: "/tmp" }),
        JSON.stringify({ type: "system", subtype: "hook_started", hook_id: "abc" }),
        JSON.stringify({ type: "assistant", message: { content: [{ type: "thinking", thinking: "Let me think..." }] } }),
        JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Hello! What would you like to brainstorm?" }] } }),
        JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Read", input: {} }] } }),
        JSON.stringify({ type: "rate_limit_event", rate_limit_info: {} }),
        JSON.stringify({ type: "result", result: "Hello! What would you like to brainstorm?" }),
      ].join("\n") + "\n";

      lastMockProcess.stdout!.push(Buffer.from(lines));

      // Only the assistant text line should be broadcast
      expect(broadcasts).toHaveLength(1);
      expect(broadcasts[0]).toEqual({
        type: "brainstorm_output",
        taskId: task.id,
        chunk: "Hello! What would you like to brainstorm?",
      });
    });

    it("handles chunks split across data events", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "BS split",
        taskType: "brainstorm",
        brainstormStatus: "active",
        assignee: "bs-agent",
      }).returning();

      await service.startSession(task.id, "/tmp/bs");
      broadcasts.length = 0;

      const fullLine = JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Split message" }] } });
      const splitAt = Math.floor(fullLine.length / 2);

      // Push first half (no newline yet — incomplete line)
      lastMockProcess.stdout!.push(Buffer.from(fullLine.slice(0, splitAt)));
      expect(broadcasts).toHaveLength(0);

      // Push second half with newline
      lastMockProcess.stdout!.push(Buffer.from(fullLine.slice(splitAt) + "\n"));
      expect(broadcasts).toHaveLength(1);
      expect(broadcasts[0]).toEqual({
        type: "brainstorm_output",
        taskId: task.id,
        chunk: "Split message",
      });
    });

    it("flushes remaining buffer on process close", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "BS flush",
        taskType: "brainstorm",
        brainstormStatus: "active",
        assignee: "bs-agent",
      }).returning();

      await service.startSession(task.id, "/tmp/bs");
      broadcasts.length = 0;

      // Push a line without trailing newline
      const line = JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Final words" }] } });
      lastMockProcess.stdout!.push(Buffer.from(line));
      expect(broadcasts).toHaveLength(0);

      // Close the process — should flush
      lastMockProcess.emit("close", 0, null);
      expect(broadcasts).toHaveLength(1);
      expect(broadcasts[0]).toEqual({
        type: "brainstorm_output",
        taskId: task.id,
        chunk: "Final words",
      });
    });
  });

  describe("killSession", () => {
    it("kills process and cleans up", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "BS kill",
        taskType: "brainstorm",
        brainstormStatus: "active",
        assignee: "bs-agent",
      }).returning();

      await service.startSession(task.id, "/tmp/bs");
      await service.killSession(task.id);

      expect(lastMockProcess.kill).toHaveBeenCalled();
      expect(service.hasActiveSession(task.id)).toBe(false);
    });
  });
});
