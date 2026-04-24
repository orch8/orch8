import { describe, it, expect } from "vitest";
import { buildEnv } from "../adapter/env-builder.js";
import type { ClaudeLocalAdapterConfig, RunContext } from "../adapter/types.js";

describe("Agent envVars injection", () => {
  it("includes agent-configured env vars in the process environment", () => {
    const config: ClaudeLocalAdapterConfig = {
      model: "claude-sonnet-4-6",
      env: {
        CUSTOM_API_KEY: "sk-test-123",
        FEATURE_FLAG: "true",
      },
    };

    const ctx: RunContext = {
      agentId: "eng",
      agentName: "Engineer",
      projectId: "proj_1",
      runId: "run_1",
      agentToken: "agent-token",
      wakeReason: "assignment",
      apiUrl: "http://localhost:3000",
      cwd: "/tmp",
    };

    const env = buildEnv(config, ctx, {});

    expect(env.CUSTOM_API_KEY).toBe("sk-test-123");
    expect(env.FEATURE_FLAG).toBe("true");
    expect(env.ORCH_AGENT_ID).toBe("eng");
    expect(env.ORCH_AGENT_TOKEN).toBe("agent-token");
  });

  it("agent env vars do not override ORCH_* identity vars", () => {
    const config: ClaudeLocalAdapterConfig = {
      env: {
        ORCH_AGENT_ID: "malicious-override",
      },
    };

    const ctx: RunContext = {
      agentId: "eng",
      agentName: "Engineer",
      projectId: "proj_1",
      runId: "run_1",
      wakeReason: "assignment",
      apiUrl: "http://localhost:3000",
      cwd: "/tmp",
    };

    const env = buildEnv(config, ctx, {});

    // ORCH_* vars must be set AFTER config.env, so identity is authoritative
    expect(env.ORCH_AGENT_ID).toBe("eng");
  });

  describe("ORCH_FINISH_STRATEGY", () => {
    const baseCtx = {
      agentId: "eng",
      agentName: "Engineer",
      projectId: "proj_1",
      runId: "run_1",
      wakeReason: "assignment" as const,
      apiUrl: "http://localhost:3000",
      cwd: "/tmp",
    };

    it("injects ORCH_FINISH_STRATEGY when finishStrategy is set", () => {
      const env = buildEnv({}, { ...baseCtx, finishStrategy: "pr" }, {});
      expect(env.ORCH_FINISH_STRATEGY).toBe("pr");
    });

    it("does not inject ORCH_FINISH_STRATEGY when undefined (brainstorm)", () => {
      const env = buildEnv({}, baseCtx, {});
      expect(env.ORCH_FINISH_STRATEGY).toBeUndefined();
    });

    it("does not inject the removed ORCH_WORKTREE_PATH var", () => {
      const env = buildEnv({}, { ...baseCtx, finishStrategy: "merge" }, {});
      expect(env.ORCH_WORKTREE_PATH).toBeUndefined();
      expect(env.ORCH_WORKSPACE_BRANCH).toBeUndefined();
    });
  });
});
