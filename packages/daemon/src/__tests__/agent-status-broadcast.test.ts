import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { AgentService } from "../services/agent.service.js";
import { BroadcastService } from "../services/broadcast.service.js";
import { projects, agents } from "@orch/shared/db";

describe("AgentService broadcast", () => {
  let testDb: TestDb;
  let service: AgentService;
  let mockSocket: { readyState: number; send: ReturnType<typeof vi.fn> };
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    mockSocket = { readyState: 1, send: vi.fn() };
    const sockets = new Set([mockSocket]) as unknown as Set<import("ws").WebSocket>;
    const broadcastService = new BroadcastService(sockets);
    service = new AgentService(testDb.db, broadcastService);
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(agents);
    await testDb.db.delete(projects);
    mockSocket.send.mockClear();

    const [project] = await testDb.db.insert(projects).values({
      name: "Test",
      slug: "test",
      homeDir: "/tmp/test",
      worktreeDir: "/tmp/wt",
    }).returning();
    projectId = project.id;
  });

  it("broadcasts agent_paused on pause", async () => {
    const agent = await service.create({
      id: "eng",
      projectId,
      name: "Engineer",
      role: "engineer",
    });

    await service.pause("eng", projectId, "manual");

    const payload = JSON.parse(mockSocket.send.mock.calls[0][0]);
    expect(payload.type).toBe("agent_paused");
    expect(payload.agentId).toBe("eng");
    expect(payload.reason).toBe("manual");
  });

  it("broadcasts agent_resumed on resume", async () => {
    const agent = await service.create({
      id: "eng",
      projectId,
      name: "Engineer",
      role: "engineer",
    });
    await service.pause("eng", projectId);
    mockSocket.send.mockClear();

    await service.resume("eng", projectId);

    const payload = JSON.parse(mockSocket.send.mock.calls[0][0]);
    expect(payload.type).toBe("agent_resumed");
    expect(payload.agentId).toBe("eng");
  });
});
