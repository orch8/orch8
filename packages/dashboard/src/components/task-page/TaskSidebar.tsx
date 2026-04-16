import { useUpdateTask } from "../../hooks/useTasks.js";
import { useAgents } from "../../hooks/useAgents.js";
import { useTaskCost } from "../../hooks/useCost.js";
import { DependenciesSection } from "../task-detail/DependenciesSection.js";
import { InlineEdit } from "./InlineEdit.js";
import { KANBAN_COLUMNS, COLUMN_LABELS, type KanbanColumn } from "@orch/shared";
import type { Task } from "../../types.js";

const COLUMN_COLORS: Record<string, string> = {
  backlog: "bg-zinc-600",
  blocked: "bg-red-600",
  in_progress: "bg-blue-600",
  review: "bg-purple-600",
  verification: "bg-amber-600",
  done: "bg-emerald-600",
};

interface TaskSidebarProps {
  task: Task;
  projectId: string;
  allTasks: Task[];
}

export function TaskSidebar({ task, projectId, allTasks }: TaskSidebarProps) {
  const updateTask = useUpdateTask();
  const { data: agents } = useAgents(projectId);
  const { data: taskCost } = useTaskCost(task.id, projectId);

  function patch(field: string, value: any) {
    updateTask.mutate({ taskId: task.id, [field]: value });
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      {/* Status */}
      <div>
        <span className="text-xs text-zinc-500">Status</span>
        <div className="mt-1 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${COLUMN_COLORS[task.column] ?? "bg-zinc-600"}`} />
          <InlineEdit
            value={task.column}
            inputType="select"
            options={KANBAN_COLUMNS.map((c) => ({ value: c, label: COLUMN_LABELS[c as KanbanColumn] }))}
            onSave={(v) => patch("column", v)}
            renderDisplay={(v) => <span className="text-sm text-zinc-300">{v}</span>}
          />
        </div>
      </div>

      {/* Priority */}
      <div>
        <span className="text-xs text-zinc-500">Priority</span>
        <div className="mt-1">
          <InlineEdit
            value={task.priority ?? "medium"}
            inputType="select"
            options={[
              { value: "high", label: "High" },
              { value: "medium", label: "Medium" },
              { value: "low", label: "Low" },
            ]}
            onSave={(v) => patch("priority", v)}
            renderDisplay={(v) => (
              <span className={`text-sm ${v === "high" ? "text-red-400" : v === "low" ? "text-zinc-500" : "text-yellow-400"}`}>
                {v}
              </span>
            )}
          />
        </div>
      </div>

      {/* Type */}
      <div>
        <span className="text-xs text-zinc-500">Type</span>
        <p className="mt-1 text-sm">
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${
            task.taskType === "quick" ? "bg-blue-900/50 text-blue-300"
              : "bg-amber-900/50 text-amber-300"
          }`}>
            {task.taskType}
          </span>
        </p>
      </div>

      {/* Assignee */}
      <div>
        <span className="text-xs text-zinc-500">Assignee</span>
        <div className="mt-1">
          <InlineEdit
            value={task.assignee ?? ""}
            inputType="select"
            options={[
              { value: "", label: "Unassigned" },
              ...(agents?.map((a) => ({ value: a.id, label: a.name })) ?? []),
            ]}
            onSave={(v) => patch("assignee", v || null)}
            renderDisplay={(v) => (
              <span className="text-sm text-zinc-300">{(agents?.find((a) => a.id === v)?.name ?? v) || "Unassigned"}</span>
            )}
          />
        </div>
      </div>


      {/* Branch */}
      {task.branch && (
        <div>
          <span className="text-xs text-zinc-500">Branch</span>
          <p className="mt-1 font-mono text-xs text-zinc-400">{task.branch}</p>
        </div>
      )}

      {/* Cost */}
      {taskCost && (
        <div>
          <span className="text-xs text-zinc-500">Cost</span>
          <p className="mt-1 text-sm text-zinc-300">${taskCost.total.toFixed(4)}</p>
        </div>
      )}

      {/* Dependencies */}
      <DependenciesSection task={task} allTasks={allTasks} />
    </aside>
  );
}
