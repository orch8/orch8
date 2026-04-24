import type { RunContext } from "../types.js";
import type { CodexLocalAdapterConfig } from "./types.js";

const NESTING_GUARD_VARS = [
  "CODEX_CI",
  "CODEX_MANAGED_BY_NPM",
  "CODEX_SANDBOX",
  "CODEX_SANDBOX_NETWORK_DISABLED",
  "CODEX_THREAD_ID",
  "CODEX_HOME",
] as const;

export function buildCodexEnv(
  config: CodexLocalAdapterConfig,
  ctx: RunContext,
  codexHome: string,
  baseEnv: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...baseEnv };

  for (const key of NESTING_GUARD_VARS) {
    delete env[key];
  }

  if (config.env) {
    Object.assign(env, config.env);
  }

  env.CODEX_HOME = codexHome;
  env.ORCH_AGENT_ID = ctx.agentId;
  env.ORCH_PROJECT_ID = ctx.projectId;
  env.ORCH_RUN_ID = ctx.runId;
  env.ORCH_API_URL = ctx.apiUrl;
  if (ctx.agentToken) env.ORCH_AGENT_TOKEN = ctx.agentToken;
  env.ORCH_WAKE_REASON = ctx.wakeReason;
  env.ORCH_WORKSPACE_CWD = ctx.cwd;

  if (ctx.taskId) env.ORCH_TASK_ID = ctx.taskId;
  if (ctx.parentRunId) env.ORCH_PARENT_RUN_ID = ctx.parentRunId;
  if (ctx.subtaskScope) env.ORCH_SUBTASK_SCOPE = ctx.subtaskScope;
  if (ctx.workspaceRepoUrl) env.ORCH_WORKSPACE_REPO_URL = ctx.workspaceRepoUrl;
  if (ctx.workspaceId) env.ORCH_WORKSPACE_ID = ctx.workspaceId;
  if (ctx.finishStrategy) env.ORCH_FINISH_STRATEGY = ctx.finishStrategy;
  if (ctx.wakeCommentId) env.ORCH_WAKE_COMMENT_ID = ctx.wakeCommentId;
  if (ctx.linkedIssueIds) env.ORCH_LINKED_ISSUE_IDS = ctx.linkedIssueIds;

  return env;
}

export function resolveCodexBillingType(
  env: Record<string, string | undefined>,
): "api" | "subscription" {
  const key = env.OPENAI_API_KEY;
  return key && key.length > 0 ? "api" : "subscription";
}
