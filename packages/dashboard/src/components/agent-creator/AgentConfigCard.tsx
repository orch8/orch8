import { useState } from "react";

interface AgentConfig {
  id?: string;
  name?: string;
  role?: string;
  model?: string;
  effort?: string;
  maxTurns?: number;
  icon?: string;
  systemPrompt?: string;
  canCreateTasks?: boolean;
  canMoveTo?: string[];
  canAssignTo?: string[];
  heartbeatEnabled?: boolean;
  heartbeatIntervalSec?: number;
  budgetLimitUsd?: number;
  [key: string]: unknown;
}

interface AgentConfigCardProps {
  config: AgentConfig;
  onConfirm: () => void;
  isConfirming: boolean;
}

export function AgentConfigCard({ config, onConfirm, isConfirming }: AgentConfigCardProps) {
  const [expanded, setExpanded] = useState(false);

  const permissions: string[] = [];
  if (config.canCreateTasks) permissions.push("Can create tasks");
  if (config.canMoveTo?.length) permissions.push(`Can move to: ${config.canMoveTo.join(", ")}`);
  if (config.canAssignTo?.length) permissions.push(`Can assign to: ${config.canAssignTo.join(", ")}`);
  if (config.heartbeatEnabled) permissions.push(`Heartbeat: every ${config.heartbeatIntervalSec ?? 0}s`);

  return (
    <div className="my-2 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        {config.icon && <span className="text-2xl">{config.icon}</span>}
        <div>
          <h4 className="text-sm font-semibold text-zinc-100">
            {config.name ?? "Unnamed Agent"}
          </h4>
          <p className="text-xs text-zinc-500">
            {config.role ?? "custom"} · {config.model ?? "default"}{config.effort ? ` · ${config.effort}` : ""}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="mt-3 flex flex-col gap-1.5 text-xs text-zinc-400">
        {config.maxTurns && (
          <p>Max turns: {config.maxTurns}</p>
        )}
        {permissions.length > 0 && (
          <div>
            <p className="font-medium text-zinc-300">Permissions:</p>
            <ul className="ml-3 list-disc">
              {permissions.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </div>
        )}
        {config.budgetLimitUsd != null && (
          <p>Budget: ${config.budgetLimitUsd.toFixed(2)}</p>
        )}
      </div>

      {/* Prompt preview */}
      {config.systemPrompt && (
        <div className="mt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-zinc-400 hover:text-zinc-300"
          >
            {expanded ? "Hide" : "Show"} system prompt
          </button>
          {expanded && (
            <pre className="mt-1 max-h-40 overflow-y-auto rounded bg-zinc-900 p-2 text-xs text-zinc-400">
              {config.systemPrompt}
            </pre>
          )}
        </div>
      )}

      {/* Create button */}
      <button
        onClick={onConfirm}
        disabled={isConfirming}
        className="mt-4 w-full rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
      >
        {isConfirming ? "Creating..." : "Create Agent"}
      </button>
    </div>
  );
}
