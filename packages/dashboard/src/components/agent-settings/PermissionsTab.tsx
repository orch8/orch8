import { useState, useEffect } from "react";
import { useAgents } from "../../hooks/useAgents.js";
import { KANBAN_COLUMNS, COLUMN_LABELS, type KanbanColumn } from "../../types.js";
import type { Agent } from "../../types.js";
import type { UseMutationResult } from "@tanstack/react-query";

interface PermissionsTabProps {
  agent: Agent;
  projectId: string;
  updateAgent: UseMutationResult<any, any, any, any>;
}

export function PermissionsTab({ agent, projectId, updateAgent }: PermissionsTabProps) {
  const { data: allAgents } = useAgents(projectId);
  const [canCreateTasks, setCanCreateTasks] = useState(agent.canCreateTasks ?? false);
  const [canMoveTo, setCanMoveTo] = useState<string[]>(agent.canMoveTo ?? []);
  const [canAssignTo, setCanAssignTo] = useState<string[]>(agent.canAssignTo ?? []);

  useEffect(() => {
    setCanCreateTasks(agent.canCreateTasks ?? false);
    setCanMoveTo(agent.canMoveTo ?? []);
    setCanAssignTo(agent.canAssignTo ?? []);
  }, [agent]);

  function toggleMoveTo(col: string) {
    setCanMoveTo((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col],
    );
  }

  function toggleAssignTo(agentId: string) {
    setCanAssignTo((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId],
    );
  }

  function handleSave() {
    updateAgent.mutate({
      agentId: agent.id,
      projectId,
      canCreateTasks,
      canMoveTo: canMoveTo as any,
      canAssignTo,
    });
  }

  const otherAgents = allAgents?.filter((a) => a.id !== agent.id) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={canCreateTasks} onChange={(e) => setCanCreateTasks(e.target.checked)} className="rounded border-zinc-700" />
        Can Create Tasks
      </label>

      <div>
        <p className="mb-2 text-sm font-medium text-zinc-300">Can Move To</p>
        <div className="flex flex-wrap gap-2">
          {KANBAN_COLUMNS.map((col) => (
            <button
              key={col}
              type="button"
              onClick={() => toggleMoveTo(col)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                canMoveTo.includes(col) ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {COLUMN_LABELS[col as KanbanColumn]}
            </button>
          ))}
        </div>
      </div>

      {otherAgents.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-zinc-300">Can Assign To</p>
          <div className="flex flex-wrap gap-2">
            {otherAgents.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => toggleAssignTo(a.id)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  canAssignTo.includes(a.id) ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={updateAgent.isPending}
        className="self-start rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {updateAgent.isPending ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}
