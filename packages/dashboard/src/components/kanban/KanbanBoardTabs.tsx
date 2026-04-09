import { useState, useMemo } from "react";
import { useTasks, useTransitionTask } from "../../hooks/useTasks.js";
import { KANBAN_COLUMNS, type Task, type KanbanColumn } from "../../types.js";
import { TaskCard } from "./TaskCard.js";
import { TaskMoveMenu } from "./TaskMoveMenu.js";

const TAB_STRIPE: Record<string, string> = {
  backlog: "bg-whisper",
  blocked: "bg-amber",
  in_progress: "bg-accent",
  done: "bg-blue/60",
};

const TAB_LABEL: Record<string, string> = {
  backlog: "BACKLOG",
  blocked: "BLOCKED",
  in_progress: "IN PROGRESS",
  done: "DONE",
};

interface KanbanBoardTabsProps {
  projectId: string;
  onTaskSelect?: (taskId: string) => void;
  filters?: { assignee?: string; priority?: string; taskType?: string };
}

export function KanbanBoardTabs({
  projectId,
  onTaskSelect,
  filters = {},
}: KanbanBoardTabsProps) {
  const { data: tasks } = useTasks(projectId);
  const transition = useTransitionTask();
  const [activeTab, setActiveTab] = useState<KanbanColumn>("in_progress");
  const [moveMenuTask, setMoveMenuTask] = useState<Task | null>(null);

  const tasksByColumn = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    for (const col of KANBAN_COLUMNS) grouped[col] = [];
    if (tasks) {
      for (const task of tasks) {
        if (filters.assignee && task.assignee !== filters.assignee) continue;
        if (filters.priority && task.priority !== filters.priority) continue;
        if (filters.taskType && task.taskType !== filters.taskType) continue;
        if (grouped[task.column]) grouped[task.column].push(task);
      }
    }
    return grouped;
  }, [tasks, filters]);

  function handleMove(taskId: string, targetColumn: string) {
    transition.mutate({ taskId, column: targetColumn });
    setMoveMenuTask(null);
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-edge-soft">
        {KANBAN_COLUMNS.map((col) => {
          const isActive = col === activeTab;
          return (
            <button
              key={col}
              onClick={() => setActiveTab(col)}
              className={`focus-ring relative flex-1 px-2 py-3 text-center type-label transition-colors ${
                isActive ? "text-ink" : "text-mute hover:text-ink"
              }`}
            >
              <span>{TAB_LABEL[col]}</span>
              <span
                className="ml-1 type-mono"
                data-testid={`tab-count-${col}`}
              >
                {tasksByColumn[col]?.length ?? 0}
              </span>
              {isActive && (
                <span
                  className={`absolute bottom-0 left-0 h-[2px] w-full ${TAB_STRIPE[col] ?? "bg-whisper"}`}
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Task list for active tab */}
      <div className="flex flex-col gap-[var(--gap-block)] p-[var(--gap-block)]">
        {(tasksByColumn[activeTab] ?? []).map((task) => (
          <div
            key={task.id}
            onContextMenu={(e) => {
              e.preventDefault();
              setMoveMenuTask(task);
            }}
          >
            <TaskCard
              task={task}
              onClick={() => onTaskSelect?.(task.id)}
              onLongPress={() => setMoveMenuTask(task)}
            />
          </div>
        ))}
        {(tasksByColumn[activeTab] ?? []).length === 0 && (
          <p className="py-8 text-center type-micro text-whisper">No tasks</p>
        )}
      </div>

      {/* Move-to overlay */}
      {moveMenuTask && (
        <TaskMoveMenu
          task={moveMenuTask}
          onMove={handleMove}
          onClose={() => setMoveMenuTask(null)}
        />
      )}
    </div>
  );
}
