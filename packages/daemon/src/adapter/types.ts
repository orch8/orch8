// packages/daemon/src/adapter/types.ts

// ─── Adapter Configuration (spec §9) ─────────────────────

export interface ClaudeLocalAdapterConfig {
  command?: string;
  extraArgs?: string[];

  model?: string;
  effort?: "low" | "medium" | "high";

  maxTurnsPerRun?: number;
  chrome?: boolean;
  dangerouslySkipPermissions?: boolean;

  instructionsFilePath?: string;
  promptTemplate?: string;
  bootstrapPromptTemplate?: string;

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
  projectId: string;
  runId: string;
  taskId?: string;

  wakeReason: "timer" | "assignment" | "on_demand" | "automation";
  apiUrl: string;
  cwd: string;

  // Prompt data
  taskTitle?: string;
  taskDescription?: string;
  taskPhase?: string;
  taskResearchOutput?: string;
  taskPlanOutput?: string;
  brainstormTranscript?: string;
  context?: Record<string, string>;

  // Session
  sessionId?: string;

  // Log capture
  logStream?: import("node:fs").WriteStream;

  // Real-time event callback
  onEvent?: (event: StreamEvent) => void;

  // Subagent context
  parentRunId?: string;
  subtaskScope?: string;
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
  usage: StreamResultEvent["usage"] | null;
  costUsd: number | null;
  billingType: "api" | "subscription";
  exitCode: number | null;
  signal: string | null;
  error: string | null;
  errorCode: RunErrorCode | null;
  events: StreamEvent[];
}

export type RunErrorCode =
  | "auth_required"
  | "unknown_session"
  | "max_turns_reached"
  | "timeout"
  | "process_error";
