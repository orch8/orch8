export interface CodexLocalAdapterConfig {
  command?: string;
  cwd?: string;
  model?: string;
  modelReasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
  profile?: string;
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  fullAuto?: boolean;
  dangerouslyBypassApprovalsAndSandbox?: boolean;
  search?: boolean;
  addDirs?: string[];
  ignoreUserConfig?: boolean;
  ignoreRules?: boolean;
  configOverrides?: Record<string, string>;
  extraArgs?: string[];
  env?: Record<string, string>;
  timeoutSec?: number;
  graceSec?: number;
}

export const DEFAULT_CODEX_LOCAL_MODEL = "gpt-5.5";
export const DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX = true;

export type CodexStreamEvent =
  | { type: "thread.started"; thread_id: string }
  | { type: "turn.started" }
  | { type: "item.started"; item: CodexStreamItem }
  | { type: "item.completed"; item: CodexStreamItem }
  | { type: "turn.completed"; usage?: CodexUsage }
  | { type: "turn.failed"; error?: unknown; message?: string }
  | { type: "error"; error?: unknown; message?: string };

export interface CodexUsage {
  input_tokens: number;
  cached_input_tokens?: number;
  output_tokens: number;
}

export type CodexStreamItem =
  | CodexAgentMessageItem
  | CodexCommandExecutionItem
  | CodexFileChangeItem
  | (Record<string, unknown> & { id?: string; type: string });

export interface CodexAgentMessageItem {
  id: string;
  type: "agent_message";
  text: string;
}

export interface CodexCommandExecutionItem {
  id: string;
  type: "command_execution";
  command?: string;
  aggregated_output?: string;
  exit_code?: number | null;
  status?: string;
}

export interface CodexFileChangeItem {
  id: string;
  type: "file_change";
  changes?: Array<{ path?: string; kind?: string }>;
  status?: string;
}
