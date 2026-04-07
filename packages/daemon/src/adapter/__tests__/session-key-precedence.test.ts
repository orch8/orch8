import { describe, it, expect } from "vitest";

describe("RunContext sessionKey precedence", () => {
  it("uses sessionKey over taskId when both present", () => {
    const sessionKey: string | undefined = "chat_abc";
    const taskId: string | undefined = "task_xyz";
    const runId = "run_123";
    const taskKey = sessionKey ?? taskId ?? runId;
    expect(taskKey).toBe("chat_abc");
  });

  it("falls back to taskId when sessionKey missing", () => {
    const sessionKey: string | undefined = undefined;
    const taskId: string | undefined = "task_xyz";
    const runId = "run_123";
    const taskKey = sessionKey ?? taskId ?? runId;
    expect(taskKey).toBe("task_xyz");
  });

  it("falls back to runId when both missing", () => {
    const sessionKey: string | undefined = undefined;
    const taskId: string | undefined = undefined;
    const runId = "run_123";
    const taskKey = sessionKey ?? taskId ?? runId;
    expect(taskKey).toBe("run_123");
  });
});
