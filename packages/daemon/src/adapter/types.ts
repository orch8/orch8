// packages/daemon/src/adapter/types.ts

import type { spawn as nodeSpawn } from "node:child_process";
import type { WakeReason } from "./prompt-builder.js";

/**
 * The Node child_process spawn function. Defined here as a neutral
 * location so the adapter and the (future) chat-spawning code don't
 * have to import it from a service module. Replaces the previous home
 * in `services/brainstorm.service.ts`, which was deleted in Plan 06.
 */
export type SpawnFn = typeof nodeSpawn;

// ─── Adapter Configuration (spec §9) ─────────────────────

export interface ClaudeLocalAdapterConfig {
  command?: string;
  extraArgs?: string[];

  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";

  maxTurnsPerRun?: number;
  chrome?: boolean;
  dangerouslySkipPermissions?: boolean;

  cwd?: string;
  workspaceStrategy?: {
    type: "git_worktree";
    baseRef?: string;
    branchTemplate?: string;
    worktreeParentDir?: string;
  };

  env?: Record<string, string>;

  timeoutSec?: number;
  graceSec?: number;

  maxConcurrentSubagents?: number;
}

// ─── Provider-neutral Adapter Contract ───────────────────

export interface AdapterCapabilities {
  requiresMaterializedRuntimeSkills: boolean;
  supportsInstructionsBundle: boolean;
}

export interface RunAgentInstructions {
  projectRoot: string;
  slug: string;
  wake: WakeReason;
  sessionHandoff?: string;
  desiredSkills?: string[];
}

export interface TestEnvironmentResult {
  ok: boolean;
  errorCode?: RunErrorCode | "not_found";
  message?: string;
  sessionId?: string;
  raw?: unknown;
}

export interface AgentAdapter {
  readonly type: string;
  readonly capabilities: AdapterCapabilities;
  runAgent(config: unknown, ctx: RunContext, instructions: RunAgentInstructions): Promise<RunResult>;
  testEnvironment(config: unknown): Promise<TestEnvironmentResult>;
}

export interface Usage {
  input_tokens: number;
  cache_read_input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens: number;
}

interface RuntimeEventBase {
  type?: string;
  rawPayload: unknown;
}

export type RuntimeStreamEvent =
  | (RuntimeEventBase & { kind: "init"; sessionId: string; model?: string })
  | (RuntimeEventBase & { kind: "assistant_text"; text: string })
  | (RuntimeEventBase & { kind: "tool_use"; toolName: string; input: unknown; toolUseId: string })
  | (RuntimeEventBase & { kind: "tool_result"; toolUseId: string; output: unknown; isError: boolean })
  | (RuntimeEventBase & { kind: "result"; usage?: Usage; costUsd?: number | null; result?: string | null })
  | (RuntimeEventBase & { kind: "error"; errorCode: RunErrorCode; message: string });

// ─── Stream-JSON Events (spec §4) ────────────────────────

export interface StreamInitEvent {
  type: "system";
  subtype: "init";
  session_id: string;
  model: string;
}

export interface StreamAssistantEvent {
  type: "assistant";
  session_id: string;
  message: {
    content: Array<{ type: string; text?: string }>;
  };
}

export interface StreamResultEvent {
  type: "result";
  session_id: string;
  result: string;
  model: string;
  usage: {
    input_tokens: number;
    cache_read_input_tokens?: number;
    output_tokens: number;
  };
  total_cost_usd: number;
}

export type StreamEvent = StreamInitEvent | StreamAssistantEvent | StreamResultEvent;

// ─── Run Context ─────────────────────────────────────────

export interface RunContext {
  agentId: string;
  agentName: string;
  agentRole?: string;
  projectId: string;
  runId: string;
  taskId?: string;
  /**
   * Overrides `taskId ?? runId` as the session lookup key. Used by chat turns
   * where the entity owning the session is a `chat`, not a task.
   */
  sessionKey?: string;

  wakeReason: "timer" | "assignment" | "on_demand" | "automation";
  apiUrl: string;
  cwd: string;

  // Prompt data
  taskTitle?: string;
  taskDescription?: string;
  brainstormTranscript?: string;
  context?: Record<string, string>;

  // Session
  sessionId?: string;

  // Log capture
  logStream?: import("node:fs").WriteStream;

  // Real-time event callback
  onEvent?: (event: RuntimeStreamEvent) => void;

  // Subagent context
  parentRunId?: string;
  subtaskScope?: string;

  // Workspace metadata (Phase 3)
  workspaceRepoUrl?: string;
  workspaceId?: string;
  // Resolved per-run from task.finishStrategy ?? project.finishStrategy
  finishStrategy?: "pr" | "merge" | "none";

  // Wake trigger details (Phase 3)
  wakeCommentId?: string;

  // Task linkage (Phase 3)
  linkedIssueIds?: string;

  // Pipeline context
  pipelineContext?: string;
  pipelineOutputFilePath?: string;
}

// ─── Session Params (spec §5.2) ──────────────────────────

export interface SessionParams {
  sessionId: string;
  cwd: string;
  workspaceId?: string;
}

// ─── Run Result ──────────────────────────────────────────

export interface RunResult {
  sessionId: string | null;
  model: string | null;
  result: string | null;
  usage: Usage | null;
  costUsd: number | null;
  billingType: "api" | "subscription";
  exitCode: number | null;
  signal: string | null;
  error: string | null;
  errorCode: RunErrorCode | null;
  events: RuntimeStreamEvent[];
}

export type RunErrorCode =
  | "auth_required"
  | "unknown_session"
  | "transient_upstream"
  | "max_turns_reached"
  | "timeout"
  | "process_error";
