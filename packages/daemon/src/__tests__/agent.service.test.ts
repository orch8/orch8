import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import { projects, agents, wakeupRequests } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { AgentService } from "../services/agent.service.js";

describe("AgentService", () => {
  let testDb: TestDb;
  let service: AgentService;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    service = new AgentService(testDb.db);

    const [project] = await testDb.db.insert(projects).values({
      name: "Agent Test",
      slug: "agent-test",
      homeDir: "/tmp/agent-test",
      worktreeDir: "/tmp/agent-wt",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(wakeupRequests);
    await testDb.db.delete(agents);
  });

  describe("create", () => {
    it("creates an agent with provided fields", async () => {
      const agent = await service.create({
        id: "fe-eng",
        projectId,
        name: "Frontend Engineer",
        role: "engineer",
      });

      expect(agent.id).toBe("fe-eng");
      expect(agent.projectId).toBe(projectId);
      expect(agent.name).toBe("Frontend Engineer");
      expect(agent.role).toBe("engineer");
      expect(agent.status).toBe("active");
      expect(agent.model).toBe("claude-opus-4-7");
    });

    it("creates an agent with all optional fields", async () => {
      const agent = await service.create({
        id: "cto",
        projectId,
        name: "CTO",
        role: "cto",
        model: "claude-opus-4-7",
        heartbeatEnabled: true,
        heartbeatIntervalSec: 3600,
        canCreateTasks: true,
        canAssignTo: ["fe-eng", "be-eng"],
        canMoveTo: ["in_progress", "done"],
        systemPrompt: "You are the CTO.",
        budgetLimitUsd: 50.0,
      });

      expect(agent.model).toBe("claude-opus-4-7");
      expect(agent.heartbeatEnabled).toBe(true);
      expect(agent.heartbeatIntervalSec).toBe(3600);
      expect(agent.canCreateTasks).toBe(true);
      expect(agent.canAssignTo).toEqual(["fe-eng", "be-eng"]);
      expect(agent.canMoveTo).toEqual(["in_progress", "done"]);
      expect(agent.budgetLimitUsd).toBe(50.0);
    });

    it("rejects duplicate agent id within same project", async () => {
      await service.create({ id: "dup", projectId, name: "First", role: "engineer" });
      await expect(
        service.create({ id: "dup", projectId, name: "Second", role: "engineer" }),
      ).rejects.toThrow();
    });
  });

  describe("getById", () => {
    it("returns agent by composite key", async () => {
      await service.create({ id: "lookup-test", projectId, name: "Lookup", role: "qa" });
      const agent = await service.getById("lookup-test", projectId);

      expect(agent).not.toBeNull();
      expect(agent!.id).toBe("lookup-test");
      expect(agent!.role).toBe("qa");
    });

    it("returns null for nonexistent agent", async () => {
      const agent = await service.getById("nonexistent", projectId);
      expect(agent).toBeNull();
    });
  });

  describe("list", () => {
    it("lists agents for a project", async () => {
      await service.create({ id: "a1", projectId, name: "A1", role: "engineer" });
      await service.create({ id: "a2", projectId, name: "A2", role: "qa" });

      const result = await service.list({ projectId });
      expect(result).toHaveLength(2);
    });

    it("filters by role", async () => {
      await service.create({ id: "eng-1", projectId, name: "Eng", role: "engineer" });
      await service.create({ id: "qa-1", projectId, name: "QA", role: "qa" });

      const result = await service.list({ projectId, role: "engineer" });
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe("engineer");
    });

    it("filters by status", async () => {
      await service.create({ id: "active-1", projectId, name: "Active", role: "engineer" });
      const agent = await service.create({ id: "paused-1", projectId, name: "Paused", role: "engineer" });
      await service.pause(agent.id, projectId, "testing");

      const result = await service.list({ projectId, status: "paused" });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("paused-1");
    });
  });

  describe("update", () => {
    it("updates agent fields", async () => {
      await service.create({ id: "upd-1", projectId, name: "Original", role: "engineer" });
      const updated = await service.update("upd-1", projectId, {
        name: "Updated",
        model: "claude-opus-4-7",
        maxTurns: 50,
      });

      expect(updated.name).toBe("Updated");
      expect(updated.model).toBe("claude-opus-4-7");
      expect(updated.maxTurns).toBe(50);
    });

    it("throws for nonexistent agent", async () => {
      await expect(
        service.update("nope", projectId, { name: "Nope" }),
      ).rejects.toThrow("Agent not found");
    });
  });

  describe("delete", () => {
    it("deletes an agent", async () => {
      await service.create({ id: "del-1", projectId, name: "Delete Me", role: "engineer" });
      await service.delete("del-1", projectId);

      const agent = await service.getById("del-1", projectId);
      expect(agent).toBeNull();
    });

    it("throws for nonexistent agent", async () => {
      await expect(service.delete("nope", projectId)).rejects.toThrow("Agent not found");
    });
  });

  describe("pause", () => {
    it("sets agent status to paused with reason", async () => {
      await service.create({ id: "pause-1", projectId, name: "Pause Me", role: "engineer" });
      const paused = await service.pause("pause-1", projectId, "budget exceeded");

      expect(paused.status).toBe("paused");
      expect(paused.pauseReason).toBe("budget exceeded");
    });

    it("throws if agent is already paused", async () => {
      await service.create({ id: "pause-2", projectId, name: "Already Paused", role: "engineer" });
      await service.pause("pause-2", projectId);
      await expect(service.pause("pause-2", projectId)).rejects.toThrow("already paused");
    });
  });

  describe("resume", () => {
    it("sets agent status back to active", async () => {
      await service.create({ id: "resume-1", projectId, name: "Resume Me", role: "engineer" });
      await service.pause("resume-1", projectId);
      const resumed = await service.resume("resume-1", projectId);

      expect(resumed.status).toBe("active");
      expect(resumed.pauseReason).toBeNull();
    });

    it("throws if agent is not paused", async () => {
      await service.create({ id: "resume-2", projectId, name: "Not Paused", role: "engineer" });
      await expect(service.resume("resume-2", projectId)).rejects.toThrow("not paused");
    });
  });

  describe("enqueueWakeup", () => {
    it("inserts a wakeup request for the agent", async () => {
      await service.create({ id: "wake-1", projectId, name: "Wake Me", role: "engineer" });
      const wakeup = await service.enqueueWakeup("wake-1", projectId, {
        source: "on_demand",
        reason: "Manual trigger from dashboard",
      });

      expect(wakeup.agentId).toBe("wake-1");
      expect(wakeup.projectId).toBe(projectId);
      expect(wakeup.source).toBe("on_demand");
      expect(wakeup.status).toBe("queued");
    });

    it("throws if agent does not exist", async () => {
      await expect(
        service.enqueueWakeup("nope", projectId, { source: "on_demand" }),
      ).rejects.toThrow("Agent not found");
    });

    it("throws if agent is paused", async () => {
      await service.create({ id: "wake-paused", projectId, name: "Paused", role: "engineer" });
      await service.pause("wake-paused", projectId);
      await expect(
        service.enqueueWakeup("wake-paused", projectId, { source: "on_demand" }),
      ).rejects.toThrow("paused");
    });
  });

  describe("bearer tokens", () => {
    it("create auto-generates an agent token hash", async () => {
      const agent = await service.create({
        id: "tok-eng",
        projectId,
        name: "Tok Eng",
        role: "engineer",
      });
      expect(agent.agentTokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("createWithToken returns the raw token and stores only the hash", async () => {
      const { agent, rawToken } = await service.createWithToken({
        id: "cwt-eng",
        projectId,
        name: "CWT Eng",
        role: "engineer",
      });
      expect(rawToken).toMatch(/^[0-9a-f]{32}$/);
      expect(agent.agentTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(agent.agentTokenHash).not.toBe(rawToken);
    });

    it("rotateAgentToken changes the hash and returns a new raw token", async () => {
      const created = await service.createWithToken({
        id: "rot-eng",
        projectId,
        name: "Rot Eng",
        role: "engineer",
      });
      const originalHash = created.agent.agentTokenHash;
      const { agent, rawToken } = await service.rotateAgentToken(
        "rot-eng",
        projectId,
      );
      expect(rawToken).not.toBe(created.rawToken);
      expect(agent.agentTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(agent.agentTokenHash).not.toBe(originalHash);
    });

    it("rotateAgentToken throws when the agent does not exist", async () => {
      await expect(
        service.rotateAgentToken("nope", projectId),
      ).rejects.toThrow("Agent not found");
    });
  });

  describe("getRoleDefaults", () => {
    it("returns CTO defaults with heartbeat and task creation", () => {
      const defaults = AgentService.getRoleDefaults("cto");
      expect(defaults.model).toBe("claude-opus-4-7");
      expect(defaults.heartbeatEnabled).toBe(true);
      expect(defaults.canCreateTasks).toBe(true);
      expect(defaults.maxTurns).toBeGreaterThan(25);
    });

    it("returns engineer defaults without heartbeat", () => {
      const defaults = AgentService.getRoleDefaults("engineer");
      expect(defaults.heartbeatEnabled).toBe(false);
      expect(defaults.wakeOnAssignment).toBe(true);
    });

    it("returns QA defaults with short heartbeat", () => {
      const defaults = AgentService.getRoleDefaults("qa");
      expect(defaults.heartbeatEnabled).toBe(true);
      expect(defaults.heartbeatIntervalSec).toBe(3600);
    });

    it("returns minimal defaults for custom role", () => {
      const defaults = AgentService.getRoleDefaults("custom");
      expect(defaults.heartbeatEnabled).toBe(false);
    });
  });
});
