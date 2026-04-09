import { useState } from "react";
import { useAgents } from "../../hooks/useAgents.js";
import { AgentForm } from "./AgentForm.js";
import type { Agent } from "../../types.js";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-900/50 text-emerald-300",
  paused: "bg-yellow-900/50 text-yellow-300",
  terminated: "bg-red-900/50 text-red-300",
};

interface AgentEditorProps {
  projectId: string;
}

export function AgentEditor({ projectId }: AgentEditorProps) {
  const { data: agents, isLoading } = useAgents(projectId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedAgent = agents?.find((a) => a.id === selectedId);

  if (isLoading) {
    return <p className="text-sm text-zinc-600">Loading agents...</p>;
  }

  return (
    <div className="flex h-full gap-[var(--gap-block)]">
      {/* Agent list */}
      <div className="w-64 shrink-0 space-y-1">
        {agents?.map((agent) => (
          <button
            key={agent.id}
            onClick={() => setSelectedId(agent.id)}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
              selectedId === agent.id
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            }`}
          >
            <div>
              <p className="font-medium">{agent.name}</p>
              <p className="text-xs text-zinc-600">{agent.role}</p>
            </div>
            <span
              className={`rounded px-1.5 py-0.5 text-xs ${STATUS_COLORS[agent.status] ?? ""}`}
            >
              {agent.status}
            </span>
          </button>
        ))}

        {agents?.length === 0 && (
          <p className="px-3 text-sm text-zinc-600">No agents configured</p>
        )}
      </div>

      {/* Agent detail form */}
      <div className="flex-1 overflow-y-auto">
        {selectedAgent ? (
          <AgentForm agent={selectedAgent} />
        ) : (
          <p className="text-sm text-zinc-600">
            Select an agent to view configuration
          </p>
        )}
      </div>
    </div>
  );
}
