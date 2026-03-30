// packages/daemon/src/__tests__/adapter/session-manager.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { resolve } from "node:path";
import { projects, taskSessions } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "../helpers/test-db.js";
import { SessionManager } from "../../adapter/session-manager.js";

describe("SessionManager", () => {
  let testDb: TestDb;
  let manager: SessionManager;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    manager = new SessionManager(testDb.db);

    const [project] = await testDb.db.insert(projects).values({
      name: "Session Test",
      slug: "session-test",
      homeDir: "/tmp/sess",
      worktreeDir: "/tmp/sess-wt",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(taskSessions);
  });

  describe("saveSession", () => {
    it("creates a new session record", async () => {
      await manager.saveSession({
        agentId: "agent-1",
        projectId,
        taskKey: "task-123",
        adapterType: "claude_local",
        sessionId: "sess-abc",
        cwd: "/tmp/workspace",
      });

      const rows = await testDb.db.select().from(taskSessions);
      expect(rows).toHaveLength(1);
      expect(rows[0].sessionDisplayId).toBe("sess-abc");
    });

    it("upserts on conflict (same agent + taskKey + adapter)", async () => {
      await manager.saveSession({
        agentId: "agent-1",
        projectId,
        taskKey: "task-123",
        adapterType: "claude_local",
        sessionId: "sess-1",
        cwd: "/tmp/ws",
      });

      await manager.saveSession({
        agentId: "agent-1",
        projectId,
        taskKey: "task-123",
        adapterType: "claude_local",
        sessionId: "sess-2",
        cwd: "/tmp/ws",
      });

      const rows = await testDb.db.select().from(taskSessions);
      expect(rows).toHaveLength(1);
      expect(rows[0].sessionDisplayId).toBe("sess-2");
    });
  });

  describe("lookupSession", () => {
    it("returns session params when found and cwd matches", async () => {
      await manager.saveSession({
        agentId: "agent-1",
        projectId,
        taskKey: "task-123",
        adapterType: "claude_local",
        sessionId: "sess-abc",
        cwd: "/tmp/workspace",
      });

      const result = await manager.lookupSession({
        agentId: "agent-1",
        taskKey: "task-123",
        adapterType: "claude_local",
        cwd: "/tmp/workspace",
      });

      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe("sess-abc");
    });

    it("returns null when cwd does not match (spec §5.3)", async () => {
      await manager.saveSession({
        agentId: "agent-1",
        projectId,
        taskKey: "task-123",
        adapterType: "claude_local",
        sessionId: "sess-abc",
        cwd: "/tmp/workspace-old",
      });

      const result = await manager.lookupSession({
        agentId: "agent-1",
        taskKey: "task-123",
        adapterType: "claude_local",
        cwd: "/tmp/workspace-new",
      });

      expect(result).toBeNull();
    });

    it("returns null when no session exists", async () => {
      const result = await manager.lookupSession({
        agentId: "no-agent",
        taskKey: "no-task",
        adapterType: "claude_local",
        cwd: "/tmp/ws",
      });

      expect(result).toBeNull();
    });
  });

  describe("clearSession", () => {
    it("deletes the session record", async () => {
      await manager.saveSession({
        agentId: "agent-1",
        projectId,
        taskKey: "task-123",
        adapterType: "claude_local",
        sessionId: "sess-abc",
        cwd: "/tmp/ws",
      });

      await manager.clearSession({
        agentId: "agent-1",
        taskKey: "task-123",
        adapterType: "claude_local",
      });

      const rows = await testDb.db.select().from(taskSessions);
      expect(rows).toHaveLength(0);
    });
  });
});
