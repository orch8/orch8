import { describe, it, expect } from "vitest";
import { buildEnv, resolveBillingType } from "../../adapter/env-builder.js";
import type { RunContext, ClaudeLocalAdapterConfig } from "../../adapter/types.js";

const baseContext: RunContext = {
  agentId: "agent-1",
  agentName: "Test Agent",
  projectId: "proj-1",
  runId: "run-1",
  wakeReason: "assignment",
  apiUrl: "http://localhost:3847",
  cwd: "/tmp/workspace",
};

describe("buildEnv", () => {
  it("injects ORCH_* identity variables", () => {
    const env = buildEnv({}, baseContext, {});
    expect(env.ORCH_AGENT_ID).toBe("agent-1");
    expect(env.ORCH_PROJECT_ID).toBe("proj-1");
    expect(env.ORCH_RUN_ID).toBe("run-1");
    expect(env.ORCH_API_URL).toBe("http://localhost:3847");
    expect(env.ORCH_WAKE_REASON).toBe("assignment");
    expect(env.ORCH_WORKSPACE_CWD).toBe("/tmp/workspace");
  });

  it("injects ORCH_TASK_ID when present", () => {
    const env = buildEnv({}, { ...baseContext, taskId: "task-5" }, {});
    expect(env.ORCH_TASK_ID).toBe("task-5");
  });

  it("does not inject ORCH_TASK_ID when absent", () => {
    const env = buildEnv({}, baseContext, {});
    expect(env.ORCH_TASK_ID).toBeUndefined();
  });

  it("injects subagent context when present", () => {
    const ctx: RunContext = {
      ...baseContext,
      parentRunId: "parent-run-1",
      subtaskScope: "frontend",
    };
    const env = buildEnv({}, ctx, {});
    expect(env.ORCH_PARENT_RUN_ID).toBe("parent-run-1");
    expect(env.ORCH_SUBTASK_SCOPE).toBe("frontend");
  });

  it("strips nesting guard env vars", () => {
    const baseEnv: Record<string, string> = {
      PATH: "/usr/bin",
      CLAUDECODE: "1",
      CLAUDE_CODE_ENTRYPOINT: "cli",
      CLAUDE_CODE_SESSION: "sess-old",
      CLAUDE_CODE_PARENT_SESSION: "parent-sess",
    };
    const env = buildEnv({}, baseContext, baseEnv);
    expect(env.PATH).toBe("/usr/bin");
    expect(env.CLAUDECODE).toBeUndefined();
    expect(env.CLAUDE_CODE_ENTRYPOINT).toBeUndefined();
    expect(env.CLAUDE_CODE_SESSION).toBeUndefined();
    expect(env.CLAUDE_CODE_PARENT_SESSION).toBeUndefined();
  });

  it("merges user env vars from adapter config", () => {
    const config: ClaudeLocalAdapterConfig = {
      env: { MY_VAR: "hello", ANOTHER: "world" },
    };
    const env = buildEnv(config, baseContext, {});
    expect(env.MY_VAR).toBe("hello");
    expect(env.ANOTHER).toBe("world");
  });

  it("preserves ANTHROPIC_API_KEY from base env", () => {
    const baseEnv = { ANTHROPIC_API_KEY: "sk-ant-123" };
    const env = buildEnv({}, baseContext, baseEnv);
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-123");
  });
});

describe("resolveBillingType", () => {
  it("returns 'api' when ANTHROPIC_API_KEY is set", () => {
    expect(resolveBillingType({ ANTHROPIC_API_KEY: "sk-ant-123" })).toBe("api");
  });

  it("returns 'subscription' when ANTHROPIC_API_KEY is empty", () => {
    expect(resolveBillingType({ ANTHROPIC_API_KEY: "" })).toBe("subscription");
  });

  it("returns 'subscription' when ANTHROPIC_API_KEY is absent", () => {
    expect(resolveBillingType({})).toBe("subscription");
  });
});
