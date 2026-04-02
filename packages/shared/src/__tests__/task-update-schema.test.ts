import { describe, it, expect } from "vitest";
import { UpdateTaskSchema } from "../schemas/task.js";

describe("UpdateTaskSchema — new fields", () => {
  it("accepts autoCommit", () => {
    const result = UpdateTaskSchema.safeParse({ autoCommit: true });
    expect(result.success).toBe(true);
  });

  it("accepts autoPr", () => {
    const result = UpdateTaskSchema.safeParse({ autoPr: false });
    expect(result.success).toBe(true);
  });

  it("accepts branch", () => {
    const result = UpdateTaskSchema.safeParse({ branch: "feat/my-branch" });
    expect(result.success).toBe(true);
  });

  it("accepts branch as nullable", () => {
    const result = UpdateTaskSchema.safeParse({ branch: null });
    expect(result.success).toBe(true);
  });

  it("accepts worktreePath", () => {
    const result = UpdateTaskSchema.safeParse({ worktreePath: "/tmp/wt/task-1" });
    expect(result.success).toBe(true);
  });

  it("accepts mcpTools", () => {
    const result = UpdateTaskSchema.safeParse({ mcpTools: ["tool-a", "tool-b"] });
    expect(result.success).toBe(true);
  });

  it("rejects unknown fields", () => {
    const result = UpdateTaskSchema.safeParse({
      unknownField: "should not pass",
    });
    // Zod strip mode: unknown fields are stripped, not rejected
    expect(result.success).toBe(true);
  });
});
