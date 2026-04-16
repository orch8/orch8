import { KANBAN_COLUMNS, COLUMN_LABELS, type KanbanColumn } from "@orch/shared";

export interface PermissionsData {
  canCreateTasks: boolean;
  canMoveTo: KanbanColumn[];
  canAssignTo: string[];
}

interface PermissionsStepProps {
  data: PermissionsData;
  agentIds: string[];
  onChange: (data: PermissionsData) => void;
}

export function PermissionsStep({ data, agentIds, onChange }: PermissionsStepProps) {
  function update(partial: Partial<PermissionsData>) {
    onChange({ ...data, ...partial });
  }

  function toggleMoveTo(col: KanbanColumn) {
    const next = data.canMoveTo.includes(col)
      ? data.canMoveTo.filter((c) => c !== col)
      : [...data.canMoveTo, col];
    update({ canMoveTo: next });
  }

  function toggleAssignTo(agentId: string) {
    const next = data.canAssignTo.includes(agentId)
      ? data.canAssignTo.filter((id) => id !== agentId)
      : [...data.canAssignTo, agentId];
    update({ canAssignTo: next });
  }

  return (
    <div className="flex flex-col gap-[var(--gap-section)]">
      {/* Boolean toggles */}
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={data.canCreateTasks}
            onChange={(e) => update({ canCreateTasks: e.target.checked })}
            className="rounded border-zinc-700"
          />
          Can create tasks
        </label>
      </div>

      {/* Can move to columns */}
      <div>
        <p className="mb-2 type-label text-zinc-300">Can move tasks to</p>
        <div className="flex flex-wrap gap-2">
          {KANBAN_COLUMNS.map((col) => (
            <button
              key={col}
              type="button"
              onClick={() => toggleMoveTo(col)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                data.canMoveTo.includes(col)
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {COLUMN_LABELS[col]}
            </button>
          ))}
        </div>
      </div>

      {/* Can assign to agents */}
      {agentIds.length > 0 && (
        <div>
          <p className="mb-2 type-label text-zinc-300">Can assign tasks to</p>
          <div className="flex flex-wrap gap-2">
            {agentIds.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => toggleAssignTo(id)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  data.canAssignTo.includes(id)
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                {id}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
