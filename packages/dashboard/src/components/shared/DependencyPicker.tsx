import { useState, useMemo } from "react";
import { useTasks } from "../../hooks/useTasks.js";
import { COLUMN_LABELS, type KanbanColumn } from "@orch/shared";

interface DependencyPickerProps {
  projectId: string;
  selectedIds: string[];
  excludeIds: string[];
  onAdd: (taskId: string) => void;
}

const STATUS_DOTS: Record<string, string> = {
  backlog: "bg-zinc-500",
  blocked: "bg-red-500",
  in_progress: "bg-blue-500",
  review: "bg-yellow-500",
  verification: "bg-purple-500",
  done: "bg-emerald-500",
};

export function DependencyPicker({
  projectId,
  selectedIds,
  excludeIds,
  onAdd,
}: DependencyPickerProps) {
  const [query, setQuery] = useState("");
  const { data: tasks } = useTasks(projectId);

  const filtered = useMemo(() => {
    if (!tasks || !query.trim()) return [];
    const hidden = new Set([...selectedIds, ...excludeIds]);
    const lowerQ = query.toLowerCase();
    return tasks
      .filter(
        (t) =>
          !hidden.has(t.id) &&
          (t.title.toLowerCase().includes(lowerQ) || t.id.toLowerCase().includes(lowerQ)),
      )
      .slice(0, 10);
  }, [tasks, query, selectedIds, excludeIds]);

  return (
    <div className="flex flex-col gap-1">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search tasks..."
        className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
      />
      {filtered.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-900">
          {filtered.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => {
                onAdd(task.id);
                setQuery("");
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOTS[task.column] ?? "bg-zinc-500"}`}
              />
              <span className="truncate">{task.title}</span>
              <span className="ml-auto shrink-0 text-xs text-zinc-600">
                {COLUMN_LABELS[task.column as KanbanColumn] ?? task.column}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
