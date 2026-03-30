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
    it("writes message to process stdin", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "BS msg",
        taskType: "brainstorm",
        brainstormStatus: "active",
        assignee: "bs-agent",
      }).returning();

      await service.startSession(task.id, "/tmp/bs");
      const writeSpy = vi.spyOn(lastMockProcess.stdin, "write");

      await service.sendMessage(task.id, "Hello agent");

      expect(writeSpy).toHaveBeenCalledWith(
        expect.stringContaining("Hello agent"),
        expect.any(Function),
      );
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
