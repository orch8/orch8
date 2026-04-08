import { useState } from "react";
import { useAgents } from "../../hooks/useAgents.js";
import { TaskCreateModal } from "./TaskCreateModal.js";
import { Button } from "../ui/Button.js";

export interface BoardFilters {
  assignee?: string;
  priority?: string;
  taskType?: string;
}

interface BoardToolbarProps {
  projectId: string;
  onFilterChange: (filters: BoardFilters) => void;
}

const SELECT_CLASS =
  "focus-ring rounded-sm border border-edge bg-surface px-2 py-1 type-ui text-ink";

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
      <div className="flex items-center gap-2">
        <select
          value={filters.assignee ?? ""}
          onChange={(e) => updateFilter("assignee", e.target.value)}
          aria-label="Filter by assignee"
          className={SELECT_CLASS}
        >
          <option value="">All assignees</option>
          {agents?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <select
          value={filters.priority ?? ""}
          onChange={(e) => updateFilter("priority", e.target.value)}
          aria-label="Filter by priority"
          className={SELECT_CLASS}
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
          className={SELECT_CLASS}
        >
          <option value="">All types</option>
          <option value="quick">Quick</option>
          <option value="brainstorm">Brainstorm</option>
        </select>

        <Button variant="primary" onClick={() => setShowCreate(true)}>
          + New task
        </Button>
      </div>

      <TaskCreateModal
        projectId={projectId}
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </>
  );
}
