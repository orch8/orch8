import type { Task } from "../../types.js";

const TYPE_COLORS: Record<string, string> = {
  quick: "bg-blue-900/50 text-blue-300",
  brainstorm: "bg-amber-900/50 text-amber-300",
};

const TYPE_LABELS: Record<string, string> = {
  quick: "Quick",
  brainstorm: "Brainstorm",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-400",
  medium: "text-yellow-400",
  low: "text-zinc-500",
};

const PRIORITY_LABELS: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

interface TaskCardProps {
  task: Task;
  onClick: () => void;
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full cursor-pointer rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-800/80"
    >
      <p className="mb-2 text-sm font-medium text-zinc-100">{task.title}</p>

      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${TYPE_COLORS[task.taskType] ?? ""}`}
        >
          {TYPE_LABELS[task.taskType] ?? task.taskType}
        </span>

        {task.priority && (
          <span
            className={`text-xs font-medium ${PRIORITY_COLORS[task.priority] ?? ""}`}
          >
            {PRIORITY_LABELS[task.priority] ?? task.priority}
          </span>
        )}

      </div>

      {task.assignee && (
        <p className="mt-2 text-xs text-zinc-500">{task.assignee}</p>
      )}
    </button>
  );
}
