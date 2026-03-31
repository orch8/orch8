import { useState, useEffect } from "react";
import { useUpdateAgent, usePauseAgent, useResumeAgent } from "../../hooks/useAgents.js";
import type { Agent } from "../../types.js";

interface AgentFormProps {
  agent: Agent;
}

export function AgentForm({ agent }: AgentFormProps) {
  const updateAgent = useUpdateAgent();
  const pauseAgent = usePauseAgent();
  const resumeAgent = useResumeAgent();

  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt ?? "");
  const [model, setModel] = useState(agent.model ?? "");
  const [effort, setEffort] = useState(agent.effort ?? "");
  const [budgetLimit, setBudgetLimit] = useState(
    agent.budgetLimitUsd?.toString() ?? "",
  );

  useEffect(() => {
    setSystemPrompt(agent.systemPrompt ?? "");
    setModel(agent.model ?? "");
    setEffort(agent.effort ?? "");
    setBudgetLimit(agent.budgetLimitUsd?.toString() ?? "");
  }, [agent]);

  function handleSave() {
    updateAgent.mutate({
      agentId: agent.id,
      projectId: agent.projectId,
      systemPrompt: systemPrompt || undefined,
      model: model || undefined,
      effort: effort || null,
      budgetLimitUsd: budgetLimit ? parseFloat(budgetLimit) : null,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Status + controls */}
      <div className="flex items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            agent.status === "active"
              ? "bg-emerald-900/50 text-emerald-300"
              : agent.status === "paused"
                ? "bg-yellow-900/50 text-yellow-300"
                : "bg-red-900/50 text-red-300"
          }`}
        >
          {agent.status}
        </span>

        {agent.status === "active" && (
          <button
            onClick={() =>
              pauseAgent.mutate({
                agentId: agent.id,
                projectId: agent.projectId,
              })
            }
            className="rounded bg-yellow-900/30 px-2 py-1 text-xs text-yellow-300 hover:bg-yellow-900/50"
          >
            Pause
          </button>
        )}
        {agent.status === "paused" && (
          <button
            onClick={() =>
              resumeAgent.mutate({
                agentId: agent.id,
                projectId: agent.projectId,
              })
            }
            className="rounded bg-emerald-900/30 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-900/50"
          >
            Resume
          </button>
        )}
      </div>

      {/* Identity */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Role</label>
          <p className="text-sm text-zinc-300">{agent.role}</p>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Model</label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-200 focus:border-zinc-600 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Effort</label>
          <input
            value={effort}
            onChange={(e) => setEffort(e.target.value)}
            className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-200 focus:border-zinc-600 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Budget Limit ($)</label>
          <input
            type="number"
            step="0.01"
            value={budgetLimit}
            onChange={(e) => setBudgetLimit(e.target.value)}
            className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-200 focus:border-zinc-600 focus:outline-none"
          />
        </div>
      </div>

      {/* Budget display */}
      {agent.budgetLimitUsd != null && (
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Budget Used</label>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{
                  width: `${Math.min(100, ((agent.budgetSpentUsd ?? 0) / agent.budgetLimitUsd) * 100)}%`,
                }}
              />
            </div>
            <span className="text-xs text-zinc-500">
              ${(agent.budgetSpentUsd ?? 0).toFixed(2)} / ${agent.budgetLimitUsd.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Heartbeat config */}
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Heartbeat</label>
        <p className="text-sm text-zinc-400">
          {agent.heartbeatEnabled
            ? `Every ${agent.heartbeatIntervalSec}s`
            : "Disabled"}
        </p>
      </div>

      {/* System prompt editor */}
      <div>
        <label className="mb-1 block text-xs text-zinc-500">System Prompt</label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={8}
          className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200 focus:border-zinc-600 focus:outline-none"
        />
      </div>

      {/* Phase-specific prompts */}
      {(agent.researchPrompt || agent.planPrompt || agent.implementPrompt || agent.reviewPrompt) && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Phase Prompts</h4>
          {agent.researchPrompt && (
            <details className="mb-2">
              <summary className="cursor-pointer text-xs text-zinc-400">Research</summary>
              <pre className="mt-1 rounded bg-zinc-950 p-2 text-xs text-zinc-500">{agent.researchPrompt}</pre>
            </details>
          )}
          {agent.planPrompt && (
            <details className="mb-2">
              <summary className="cursor-pointer text-xs text-zinc-400">Plan</summary>
              <pre className="mt-1 rounded bg-zinc-950 p-2 text-xs text-zinc-500">{agent.planPrompt}</pre>
            </details>
          )}
          {agent.implementPrompt && (
            <details className="mb-2">
              <summary className="cursor-pointer text-xs text-zinc-400">Implement</summary>
              <pre className="mt-1 rounded bg-zinc-950 p-2 text-xs text-zinc-500">{agent.implementPrompt}</pre>
            </details>
          )}
          {agent.reviewPrompt && (
            <details className="mb-2">
              <summary className="cursor-pointer text-xs text-zinc-400">Review</summary>
              <pre className="mt-1 rounded bg-zinc-950 p-2 text-xs text-zinc-500">{agent.reviewPrompt}</pre>
            </details>
          )}
        </div>
      )}

      {/* MCP Tools */}
      {agent.mcpTools && agent.mcpTools.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">MCP Tools</h4>
          <div className="flex flex-wrap gap-1">
            {agent.mcpTools.map((tool) => (
              <span key={tool} className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">{tool}</span>
            ))}
          </div>
        </div>
      )}

      {/* Env vars (masked) */}
      {!!agent.envVars && Object.keys(agent.envVars as Record<string, string>).length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Environment Variables</h4>
          <div className="space-y-1">
            {Object.keys(agent.envVars as Record<string, string>).map((key) => (
              <div key={key} className="flex justify-between text-xs">
                <span className="font-mono text-zinc-400">{key}</span>
                <span className="text-zinc-600">********</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={updateAgent.isPending}
        className="rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-600 disabled:opacity-40"
      >
        {updateAgent.isPending ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}
