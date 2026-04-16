import { describe, it, expect } from "vitest";
import {
  CreateAgentSchema,
  UpdateAgentSchema,
  AgentFilterSchema,
  AgentRoleSchema,
  AgentStatusSchema,
} from "@orch/shared";

describe("Agent Schemas", () => {
  describe("CreateAgentSchema", () => {
    it("validates a minimal agent creation", () => {
      const result = CreateAgentSchema.safeParse({
        id: "fe-eng",
        projectId: "proj_abc",
        name: "Frontend Engineer",
        role: "engineer",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe("fe-eng");
        expect(result.data.role).toBe("engineer");
      }
    });

    it("validates full agent creation with all optional fields", () => {
      const result = CreateAgentSchema.safeParse({
        id: "cto",
        projectId: "proj_abc",
        name: "CTO Agent",
        role: "cto",
        icon: "🧠",
        color: "#FF0000",
        model: "claude-opus-4-7",
        effort: "high",
        maxTurns: 50,
        heartbeatEnabled: true,
        heartbeatIntervalSec: 3600,
        maxConcurrentRuns: 2,
        canAssignTo: ["fe-eng", "be-eng"],
        canCreateTasks: true,
        canMoveTo: ["in_progress", "done"],
        systemPrompt: "You are the CTO.",
        promptTemplate: "Review task: {{task.title}}",
        mcpTools: ["orchestrator-api"],
        desiredSkills: ["tdd", "verification"],
        adapterType: "claude_local",
        adapterConfig: { extraArgs: ["--verbose"] },
        envVars: { CUSTOM_VAR: "value" },
        budgetLimitUsd: 10.0,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing required fields", () => {
      const result = CreateAgentSchema.safeParse({
        name: "Missing Fields",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid role", () => {
      const result = CreateAgentSchema.safeParse({
        id: "bad",
        projectId: "proj_abc",
        name: "Bad",
        role: "nonexistent",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty id", () => {
      const result = CreateAgentSchema.safeParse({
        id: "",
        projectId: "proj_abc",
        name: "Empty ID",
        role: "engineer",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid canMoveTo column values", () => {
      const result = CreateAgentSchema.safeParse({
        id: "test",
        projectId: "proj_abc",
        name: "Test",
        role: "engineer",
        canMoveTo: ["invalid_column"],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("UpdateAgentSchema", () => {
    it("validates partial update", () => {
      const result = UpdateAgentSchema.safeParse({
        name: "Updated Name",
        model: "claude-opus-4-7",
      });
      expect(result.success).toBe(true);
    });

    it("validates empty update", () => {
      const result = UpdateAgentSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("validates heartbeat config update", () => {
      const result = UpdateAgentSchema.safeParse({
        heartbeatEnabled: true,
        heartbeatIntervalSec: 60,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("AgentFilterSchema", () => {
    it("validates filter by project", () => {
      const result = AgentFilterSchema.safeParse({ projectId: "proj_abc" });
      expect(result.success).toBe(true);
    });

    it("validates filter by role and status", () => {
      const result = AgentFilterSchema.safeParse({
        projectId: "proj_abc",
        role: "engineer",
        status: "active",
      });
      expect(result.success).toBe(true);
    });

    it("validates empty filter", () => {
      const result = AgentFilterSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe("AgentRoleSchema", () => {
    it("accepts all valid roles", () => {
      const roles = [
        "cto", "engineer", "qa", "researcher", "planner",
        "implementer", "reviewer", "verifier", "referee", "custom",
      ];
      for (const role of roles) {
        expect(AgentRoleSchema.safeParse(role).success).toBe(true);
      }
    });
  });

  describe("AgentStatusSchema", () => {
    it("accepts all valid statuses", () => {
      const statuses = ["active", "paused", "terminated"];
      for (const status of statuses) {
        expect(AgentStatusSchema.safeParse(status).success).toBe(true);
      }
    });
  });
});
