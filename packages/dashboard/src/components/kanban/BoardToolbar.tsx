import { useState } from "react";
import { useAgents } from "../../hooks/useAgents.js";
import { TaskCreateModal } from "./TaskCreateModal.js";

export interface BoardFilters {
  assignee?: string;
  priority?: string;
  taskType?: string;
}

interface BoardToolbarProps {
  projectId: string;
  onFilterChange: (filters: BoardFilters) => void;
}

export function BoardToolbar({ projectId, onFilterChange }: BoardToolbarProps) {
  const [showCreate, setShowCreate] = useState(false);
  const { data: agents } = useAgents(projectId);
  const [filters, setFilters] = useState<BoardFilters>({});

  function updateFilter(key: keyof BoardFilters, value: string) {
    const next = { ...filters, [key]: value || undefined };
    setFilters(next);
    onFilterChange(next);
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-md bg-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:bg-zinc-600"
        >
          + New Task
        </button>

        <select
          value={filters.assignee ?? ""}
          onChange={(e) => updateFilter("assignee", e.target.value)}
          aria-label="Filter by assignee"
          className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
        >
          <option value="">All assignees</option>
          {agents?.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>

        <select
          value={filters.priority ?? ""}
          onChange={(e) => updateFilter("priority", e.target.value)}
          aria-label="Filter by priority"
          className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
        >
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select
          value={filters.taskType ?? ""}
          onChange={(e) => updateFilter("taskType", e.target.value)}
          aria-label="Filter by type"
          className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
        >
          <option value="">All types</option>
          <option value="quick">Quick</option>
          <option value="brainstorm">Brainstorm</option>
        </select>
      </div>

      <TaskCreateModal
        projectId={projectId}
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </>
  );
}
