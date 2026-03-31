import { describe, it, expect } from "vitest";
import { CreateAgentSchema, UpdateAgentSchema } from "../schemas/agent.js";

describe("CreateAgentSchema — new fields", () => {
  const base = {
    id: "test-agent",
    projectId: "proj_1",
    name: "Test Agent",
    role: "engineer" as const,
  };

  it("accepts autoPauseThreshold", () => {
    const result = CreateAgentSchema.safeParse({
      ...base,
      autoPauseThreshold: 80,
    });
    expect(result.success).toBe(true);
  });

  it("rejects autoPauseThreshold below 0", () => {
    const result = CreateAgentSchema.safeParse({
      ...base,
      autoPauseThreshold: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects autoPauseThreshold above 100", () => {
    const result = CreateAgentSchema.safeParse({
      ...base,
      autoPauseThreshold: 101,
    });
    expect(result.success).toBe(false);
  });

  it("accepts maxConcurrentTasks", () => {
    const result = CreateAgentSchema.safeParse({
      ...base,
      maxConcurrentTasks: 3,
    });
    expect(result.success).toBe(true);
  });

  it("accepts maxConcurrentSubagents", () => {
    const result = CreateAgentSchema.safeParse({
      ...base,
      maxConcurrentSubagents: 5,
    });
    expect(result.success).toBe(true);
  });

  it("accepts workingHours", () => {
    const result = CreateAgentSchema.safeParse({
      ...base,
      workingHours: "09:00-17:00",
    });
    expect(result.success).toBe(true);
  });
});

describe("UpdateAgentSchema — new fields", () => {
  it("accepts autoPauseThreshold as nullable", () => {
    const result = UpdateAgentSchema.safeParse({
      autoPauseThreshold: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts maxConcurrentTasks", () => {
    const result = UpdateAgentSchema.safeParse({
      maxConcurrentTasks: 2,
    });
    expect(result.success).toBe(true);
  });

  it("accepts maxConcurrentSubagents", () => {
    const result = UpdateAgentSchema.safeParse({
      maxConcurrentSubagents: 4,
    });
    expect(result.success).toBe(true);
  });

  it("accepts workingHours as nullable", () => {
    const result = UpdateAgentSchema.safeParse({
      workingHours: null,
    });
    expect(result.success).toBe(true);
  });
});
