import type { ClaudeLocalAdapterConfig, RunContext } from "./types.js";

const NESTING_GUARD_VARS = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_SESSION",
  "CLAUDE_CODE_PARENT_SESSION",
] as const;

export function buildEnv(
  config: ClaudeLocalAdapterConfig,
  ctx: RunContext,
  baseEnv: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...baseEnv };

  // Strip nesting guards (spec §2.3)
  for (const key of NESTING_GUARD_VARS) {
    delete env[key];
  }

  // User-configured env vars (spec §3) — applied BEFORE identity
  // so agent-configured vars cannot override ORCH_* identity
  if (config.env) {
    Object.assign(env, config.env);
  }

  // Inject ORCH_* identity vars (spec §3.2) — authoritative, cannot be overridden
  env.ORCH_AGENT_ID = ctx.agentId;
  env.ORCH_PROJECT_ID = ctx.projectId;
  env.ORCH_RUN_ID = ctx.runId;
  env.ORCH_API_URL = ctx.apiUrl;
  env.ORCH_WAKE_REASON = ctx.wakeReason;
  env.ORCH_WORKSPACE_CWD = ctx.cwd;

  if (ctx.taskId) {
    env.ORCH_TASK_ID = ctx.taskId;
  }

  // Subagent context (spec §3.2)
  if (ctx.parentRunId) {
    env.ORCH_PARENT_RUN_ID = ctx.parentRunId;
  }
  if (ctx.subtaskScope) {
    env.ORCH_SUBTASK_SCOPE = ctx.subtaskScope;
  }

  // Workspace metadata
  if (ctx.workspaceRepoUrl) {
    env.ORCH_WORKSPACE_REPO_URL = ctx.workspaceRepoUrl;
  }
  if (ctx.workspaceId) {
    env.ORCH_WORKSPACE_ID = ctx.workspaceId;
  }
  if (ctx.finishStrategy) {
    env.ORCH_FINISH_STRATEGY = ctx.finishStrategy;
  }

  // Wake trigger details (spec Phase 3)
  if (ctx.wakeCommentId) {
    env.ORCH_WAKE_COMMENT_ID = ctx.wakeCommentId;
  }

  // Task linkage (spec Phase 3)
  if (ctx.linkedIssueIds) {
    env.ORCH_LINKED_ISSUE_IDS = ctx.linkedIssueIds;
  }

  return env;
}

export function resolveBillingType(
  env: Record<string, string | undefined>,
): "api" | "subscription" {
  const key = env.ANTHROPIC_API_KEY;
  return key && key.length > 0 ? "api" : "subscription";
}
