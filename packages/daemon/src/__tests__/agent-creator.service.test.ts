import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Writable, Readable } from "node:stream";
import { projects, agents } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { AgentCreatorService, type SpawnFn } from "../services/agent-creator.service.js";
import { AgentService } from "../services/agent.service.js";

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

  describe("sendMessage", () => {
    it("spawns a --continue process for follow-up messages", async () => {
      const sessionId = await service.startSession(projectId, "/tmp/ct");
      lastMockProcess.emit("close", 0, null);

      const callsBefore = (mockSpawn as ReturnType<typeof vi.fn>).mock.calls.length;
      await service.sendMessage(sessionId, "I want a code reviewer");

      const newCalls = (mockSpawn as ReturnType<typeof vi.fn>).mock.calls.slice(callsBefore);
      expect(newCalls).toHaveLength(1);
      expect(newCalls[0][1]).toContain("--continue");
      expect(newCalls[0][1]).toContain("I want a code reviewer");
    });

    it("rejects if previous turn is still running", async () => {
      const sessionId = await service.startSession(projectId, "/tmp/ct");

      await expect(
        service.sendMessage(sessionId, "Hello"),
      ).rejects.toThrow("still processing");
    });

    it("throws if no active session", async () => {
      await expect(
        service.sendMessage("nonexistent", "Hi"),
      ).rejects.toThrow("No active creator session");
    });

    it("appends user message to transcript", async () => {
      const sessionId = await service.startSession(projectId, "/tmp/ct");
      lastMockProcess.emit("close", 0, null);

      await service.sendMessage(sessionId, "Make a QA bot");

      const transcript = service.getTranscript(sessionId);
      expect(transcript).toContain("[user] Make a QA bot");
    });
  });

  describe("extractConfigJson", () => {
    it("extracts JSON from the last agent-config fence in transcript", () => {
      const config = { id: "test-bot", projectId, name: "Test Bot", role: "custom" };
      const transcript = [
        "[system] You are...",
        "[user] Make me a bot",
        `[agent] Here's the config:\n\`\`\`agent-config\n${JSON.stringify(config)}\n\`\`\`\nLet me know if you want changes.`,
      ];

      const result = AgentCreatorService.extractConfigJson(transcript);
      expect(result).toEqual(config);
    });

    it("returns the LAST config if multiple exist", () => {
      const first = { id: "v1", projectId, name: "V1", role: "custom" };
      const second = { id: "v2", projectId, name: "V2", role: "engineer" };
      const transcript = [
        `[agent] \`\`\`agent-config\n${JSON.stringify(first)}\n\`\`\``,
        "[user] Change the role to engineer",
        `[agent] \`\`\`agent-config\n${JSON.stringify(second)}\n\`\`\``,
      ];

      const result = AgentCreatorService.extractConfigJson(transcript);
      expect(result).toEqual(second);
    });

    it("returns null if no config fence found", () => {
      const transcript = ["[system] You are...", "[user] Hello", "[agent] Hi there!"];
      const result = AgentCreatorService.extractConfigJson(transcript);
      expect(result).toBeNull();
    });

    it("returns null if JSON is malformed", () => {
      const transcript = [
        "[agent] ```agent-config\n{invalid json}\n```",
      ];
      const result = AgentCreatorService.extractConfigJson(transcript);
      expect(result).toBeNull();
    });
  });

  describe("confirmAgent", () => {
    it("extracts config, validates, creates agent, and cleans up session", async () => {
      const sessionId = await service.startSession(projectId, "/tmp/ct");

      // Simulate AI outputting a config
      const config = {
        id: "new-reviewer",
        projectId,
        name: "New Reviewer",
        role: "reviewer",
        model: "claude-sonnet-4-6",
        maxTurns: 15,
      };
      const configLine = JSON.stringify({
        type: "assistant",
        message: {
          content: [{
            type: "text",
            text: `Here's your config:\n\`\`\`agent-config\n${JSON.stringify(config)}\n\`\`\``,
          }],
        },
      });
      lastMockProcess.stdout!.push(Buffer.from(configLine + "\n"));
      await new Promise((r) => setTimeout(r, 10));
      lastMockProcess.emit("close", 0, null);

      const agentService = new AgentService(testDb.db);
      const agent = await service.confirmAgent(sessionId, agentService);

      expect(agent.id).toBe("new-reviewer");
      expect(agent.name).toBe("New Reviewer");
      expect(agent.role).toBe("reviewer");
      expect(service.hasActiveSession(sessionId)).toBe(false);
    });

    it("throws if no config found in transcript", async () => {
      const sessionId = await service.startSession(projectId, "/tmp/ct");
      lastMockProcess.emit("close", 0, null);

      const agentService = new AgentService(testDb.db);
      await expect(
        service.confirmAgent(sessionId, agentService),
      ).rejects.toThrow("No agent-config");
    });

    it("throws with validation errors for invalid config", async () => {
      const sessionId = await service.startSession(projectId, "/tmp/ct");

      // Config missing required fields
      const config = { name: "Bad Agent" }; // missing id, projectId, role
      const configLine = JSON.stringify({
        type: "assistant",
        message: {
          content: [{
            type: "text",
            text: `\`\`\`agent-config\n${JSON.stringify(config)}\n\`\`\``,
          }],
        },
      });
      lastMockProcess.stdout!.push(Buffer.from(configLine + "\n"));
      await new Promise((r) => setTimeout(r, 10));
      lastMockProcess.emit("close", 0, null);

      const agentService = new AgentService(testDb.db);
      await expect(
        service.confirmAgent(sessionId, agentService),
      ).rejects.toThrow();
    });
  });
});
