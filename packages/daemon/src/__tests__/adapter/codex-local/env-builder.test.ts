import { describe, expect, it } from "vitest";
import { buildCodexEnv, resolveCodexBillingType } from "../../../adapter/codex-local/env-builder.js";
import type { RunContext } from "../../../adapter/types.js";

const baseContext: RunContext = {
  agentId: "agent-1",
  agentName: "Agent",
  projectId: "proj-1",
  runId: "run-1",
  wakeReason: "assignment",
  apiUrl: "http://localhost:3847",
  cwd: "/repo",
};

describe("buildCodexEnv", () => {
  it("strips Codex nesting guards and sets CODEX_HOME", () => {
    const env = buildCodexEnv({}, baseContext, "/home/codex", {
      CODEX_CI: "1",
      CODEX_HOME: "/old",
      CODEX_THREAD_ID: "thread",
      PATH: "/bin",
    });

    expect(env.CODEX_CI).toBeUndefined();
    expect(env.CODEX_THREAD_ID).toBeUndefined();
    expect(env.PATH).toBe("/bin");
    expect(env.CODEX_HOME).toBe("/home/codex");
  });

  it("does not allow user env to shadow ORCH identity", () => {
    const env = buildCodexEnv(
      { env: { ORCH_AGENT_ID: "wrong", CUSTOM: "ok" } },
      baseContext,
      "/home/codex",
      {},
    );

    expect(env.ORCH_AGENT_ID).toBe("agent-1");
    expect(env.CUSTOM).toBe("ok");
  });

  it("injects ORCH_AGENT_TOKEN when present", () => {
    const env = buildCodexEnv(
      {},
      { ...baseContext, agentToken: "raw-token" },
      "/home/codex",
      {},
    );

    expect(env.ORCH_AGENT_TOKEN).toBe("raw-token");
  });

  it("does not inject ORCH_AGENT_TOKEN when absent", () => {
    const env = buildCodexEnv({}, baseContext, "/home/codex", {});
    expect(env.ORCH_AGENT_TOKEN).toBeUndefined();
  });
});

describe("resolveCodexBillingType", () => {
  it("returns api when OPENAI_API_KEY is present", () => {
    expect(resolveCodexBillingType({ OPENAI_API_KEY: "sk-test" })).toBe("api");
  });

  it("returns subscription otherwise", () => {
    expect(resolveCodexBillingType({})).toBe("subscription");
  });
});
