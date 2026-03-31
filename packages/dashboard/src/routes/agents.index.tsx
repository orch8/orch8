import { createFileRoute, Link } from "@tanstack/react-router";
import { useAgents } from "../hooks/useAgents.js";
import { useUiStore } from "../stores/ui.js";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-900/50 text-emerald-300",
  paused: "bg-yellow-900/50 text-yellow-300",
  terminated: "bg-red-900/50 text-red-300",
};

function AgentsListPage() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const { data: agents, isLoading } = useAgents(activeProjectId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Agents</h2>
        <Link
          to="/agents/new"
          className="rounded-md bg-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:bg-zinc-600"
        >
          + New Agent
        </Link>
      </div>

      {!activeProjectId && (
        <p className="text-sm text-zinc-500">Select a project to see agents.</p>
      )}

      {isLoading && <p className="text-sm text-zinc-600">Loading agents...</p>}

      <div className="flex flex-col gap-2">
        {agents?.map((agent) => (
          <Link
            key={agent.id}
            to="/agents/$id"
            params={{ id: agent.id }}
            className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-700"
          >
            <div>
              <p className="font-medium text-zinc-100">{agent.name}</p>
              <p className="text-xs text-zinc-500">{agent.role} · {agent.model}</p>
            </div>
            <div className="flex items-center gap-3">
              {agent.budgetLimitUsd != null && (
                <span className="text-xs text-zinc-500">
                  ${(agent.budgetSpentUsd ?? 0).toFixed(2)} / ${agent.budgetLimitUsd.toFixed(2)}
                </span>
              )}
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_COLORS[agent.status] ?? ""}`}>
                {agent.status}
              </span>
            </div>
          </Link>
        ))}

        {agents?.length === 0 && (
          <p className="text-sm text-zinc-600">No agents yet. Create one to get started.</p>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/agents/")({
  component: AgentsListPage,
});
