import { describe, it, expect } from "vitest";
import { AddBundledAgentsSchema } from "../schemas/bundled-agents.js";

describe("AddBundledAgentsSchema", () => {
  it("accepts valid input", () => {
    const result = AddBundledAgentsSchema.safeParse({
      projectId: "proj_abc123",
      agentIds: ["implementer", "reviewer"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty agentIds", () => {
    const result = AddBundledAgentsSchema.safeParse({
      projectId: "proj_abc123",
      agentIds: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing projectId", () => {
    const result = AddBundledAgentsSchema.safeParse({
      agentIds: ["implementer"],
    });
    expect(result.success).toBe(false);
  });
});
