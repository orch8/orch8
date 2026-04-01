import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Writable, Readable } from "node:stream";
import { projects, agents } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { AgentCreatorService, type SpawnFn } from "../services/agent-creator.service.js";

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

describe("AgentCreatorService", () => {
  let testDb: TestDb;
  let service: AgentCreatorService;
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

    const [project] = await testDb.db.insert(projects).values({
      name: "Creator Test",
      slug: "creator-test",
      homeDir: "/tmp/ct",
      worktreeDir: "/tmp/ct-wt",
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values([
      { id: "agent-a", projectId, name: "Agent Alpha", role: "engineer" },
      { id: "agent-b", projectId, name: "Agent Beta", role: "reviewer" },
    ]);
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(() => {
    broadcasts.length = 0;
    service = new AgentCreatorService(
      testDb.db,
      (_projectId, msg) => { broadcasts.push(msg); },
      mockSpawn,
    );
  });

  describe("buildSystemPrompt", () => {
    it("includes existing agents from the project", async () => {
      const prompt = await service.buildSystemPrompt(projectId);

      expect(prompt).toContain("agent-a");
      expect(prompt).toContain("Agent Alpha");
      expect(prompt).toContain("engineer");
      expect(prompt).toContain("agent-b");
      expect(prompt).toContain("Agent Beta");
      expect(prompt).toContain("reviewer");
    });

    it("includes available task columns", async () => {
      const prompt = await service.buildSystemPrompt(projectId);

      expect(prompt).toContain("backlog");
      expect(prompt).toContain("blocked");
      expect(prompt).toContain("in_progress");
      expect(prompt).toContain("done");
    });

    it("includes role defaults", async () => {
      const prompt = await service.buildSystemPrompt(projectId);

      expect(prompt).toContain("cto");
      expect(prompt).toContain("engineer");
      expect(prompt).toContain("custom");
    });

    it("includes schema field reference", async () => {
      const prompt = await service.buildSystemPrompt(projectId);

      expect(prompt).toContain("canMoveTo");
      expect(prompt).toContain("canAssignTo");
      expect(prompt).toContain("heartbeatEnabled");
      expect(prompt).toContain("budgetLimitUsd");
      expect(prompt).toContain("agent-config");
    });
  });

  describe("startSession", () => {
    it("spawns a process and returns a sessionId", async () => {
      const sessionId = await service.startSession(projectId, "/tmp/ct");

      expect(sessionId).toBeTruthy();
      expect(typeof sessionId).toBe("string");
      expect(mockSpawn).toHaveBeenCalled();
      expect(service.hasActiveSession(sessionId)).toBe(true);
    });

    it("passes system prompt as --print argument", async () => {
      const callsBefore = (mockSpawn as ReturnType<typeof vi.fn>).mock.calls.length;
      await service.startSession(projectId, "/tmp/ct");

      const spawnCall = (mockSpawn as ReturnType<typeof vi.fn>).mock.calls[callsBefore];
      const args = spawnCall[1] as string[];
      expect(args).toContain("--print");

      const printIdx = args.indexOf("--print");
      const prompt = args[printIdx + 1];
      expect(prompt).toContain("agent configuration assistant");
      expect(prompt).toContain("agent-a");
    });

    it("throws if project already has an active session", async () => {
      await service.startSession(projectId, "/tmp/ct");

      await expect(
        service.startSession(projectId, "/tmp/ct"),
      ).rejects.toThrow("already has an active");
    });

    it("broadcasts agent_creator_output events from stream-json", async () => {
      await service.startSession(projectId, "/tmp/ct");
      broadcasts.length = 0;

      const line = JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "Hello! What kind of agent?" }] },
      });
      lastMockProcess.stdout!.push(Buffer.from(line + "\n"));

      // Readable data events are emitted asynchronously; wait one tick
      await new Promise((r) => setTimeout(r, 10));

      expect(broadcasts).toHaveLength(1);
      expect(broadcasts[0]).toEqual({
        type: "agent_creator_output",
        sessionId: expect.any(String),
        chunk: "Hello! What kind of agent?",
      });
    });
  });
});
