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

describe("buildEnv — Phase 3 vars", () => {
  it("sets ORCH_WORKSPACE_BRANCH when workspaceBranch is provided", () => {
    const env = buildEnv({}, { ...baseContext, workspaceBranch: "feature/foo" }, {});
    expect(env.ORCH_WORKSPACE_BRANCH).toBe("feature/foo");
  });

  it("does not set ORCH_WORKSPACE_BRANCH when workspaceBranch is undefined", () => {
    const env = buildEnv({}, baseContext, {});
    expect(env.ORCH_WORKSPACE_BRANCH).toBeUndefined();
  });

  it("sets ORCH_WORKSPACE_REPO_URL when workspaceRepoUrl is provided", () => {
    const env = buildEnv({}, { ...baseContext, workspaceRepoUrl: "https://github.com/org/repo.git" }, {});
    expect(env.ORCH_WORKSPACE_REPO_URL).toBe("https://github.com/org/repo.git");
  });

  it("sets ORCH_WORKTREE_PATH when worktreePath is provided", () => {
    const env = buildEnv({}, { ...baseContext, worktreePath: "/worktrees/task-123" }, {});
    expect(env.ORCH_WORKTREE_PATH).toBe("/worktrees/task-123");
  });

  it("sets ORCH_WORKSPACE_ID when workspaceId is provided", () => {
    const env = buildEnv({}, { ...baseContext, workspaceId: "proj-1" }, {});
    expect(env.ORCH_WORKSPACE_ID).toBe("proj-1");
  });

  it("sets ORCH_WAKE_COMMENT_ID when wakeCommentId is provided", () => {
    const env = buildEnv({}, { ...baseContext, wakeCommentId: "comment-42" }, {});
    expect(env.ORCH_WAKE_COMMENT_ID).toBe("comment-42");
  });

  it("sets ORCH_LINKED_ISSUE_IDS when linkedIssueIds is provided", () => {
    const env = buildEnv({}, { ...baseContext, linkedIssueIds: "ISS-1,ISS-2,ISS-3" }, {});
    expect(env.ORCH_LINKED_ISSUE_IDS).toBe("ISS-1,ISS-2,ISS-3");
  });
});
