import { createFileRoute, Link } from "@tanstack/react-router";
import { useAgents } from "../../../../hooks/useAgents.js";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-900/50 text-emerald-300",
  paused: "bg-yellow-900/50 text-yellow-300",
  terminated: "bg-red-900/50 text-red-300",
};

function AgentsListPage() {
  const { projectSlug: projectId } = Route.useParams();
  const { data: agents, isLoading } = useAgents(projectId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="type-section font-semibold">Agents</h2>
        <div className="flex gap-2">
          <Link
            to="/projects/$projectSlug/agents/new"
            params={{ projectSlug: projectId }}
            className="rounded-md bg-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:bg-zinc-600"
          >
            + New Agent
          </Link>
        </div>
      </div>

      {isLoading && <p className="text-sm text-zinc-600">Loading agents...</p>}

      <div className="flex flex-col gap-2">
        {agents?.map((agent) => (
          <Link
            key={agent.id}
            to="/projects/$projectSlug/agents/$agentId"
            params={{ projectSlug: projectId, agentId: agent.id }}
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

export const Route = createFileRoute("/projects/$projectSlug/agents/")({
  component: AgentsListPage,
});
