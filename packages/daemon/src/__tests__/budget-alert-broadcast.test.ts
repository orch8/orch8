import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { autoPauseIfExhausted } from "../services/budget.service.js";
import { BroadcastService } from "../services/broadcast.service.js";
import { projects, agents } from "@orch/shared/db";

describe("autoPauseIfExhausted broadcast", () => {
  let testDb: TestDb;
  let broadcastService: BroadcastService;
  let mockSocket: { readyState: number; send: ReturnType<typeof vi.fn> };
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    mockSocket = { readyState: 1, send: vi.fn() };
    const sockets = new Set([mockSocket]) as unknown as Set<import("ws").WebSocket>;
    broadcastService = new BroadcastService(sockets);
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
      budgetLimitUsd: 1.0,
      budgetSpentUsd: 1.5,
    }).returning();
    projectId = project.id;
  });

  it("broadcasts budget_alert when project budget exhausted", async () => {
    await testDb.db.insert(agents).values({
      id: "eng",
      projectId,
      name: "Engineer",
      role: "engineer",
    });

    await autoPauseIfExhausted(testDb.db, "eng", projectId, broadcastService);

    const calls = mockSocket.send.mock.calls.map(
      (c) => JSON.parse(c[0] as string),
    );
    const alert = calls.find(
      (e: { type: string; level?: string }) =>
        e.type === "budget_alert" && e.level === "project",
    );
    expect(alert).toBeDefined();
    expect(alert.message).toMatch(/project budget/i);
  });

  it("broadcasts budget_alert when agent budget exhausted", async () => {
    const { eq } = await import("drizzle-orm");
    await testDb.db.update(projects).set({
      budgetSpentUsd: 0,
    }).where(eq(projects.id, projectId));

    await testDb.db.insert(agents).values({
      id: "eng",
      projectId,
      name: "Engineer",
      role: "engineer",
      budgetLimitUsd: 0.5,
      budgetSpentUsd: 0.6,
    });

    await autoPauseIfExhausted(testDb.db, "eng", projectId, broadcastService);

    const calls = mockSocket.send.mock.calls.map(
      (c) => JSON.parse(c[0] as string),
    );
    const alert = calls.find(
      (e: { type: string; level?: string }) =>
        e.type === "budget_alert" && e.level === "agent",
    );
    expect(alert).toBeDefined();
    expect(alert.entityId).toBe("eng");
  });
});
