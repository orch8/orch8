import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "../../types.js";
import { TaskCard } from "./TaskCard.js";

const COLUMN_STRIPE: Record<string, string> = {
  backlog: "bg-whisper",
  blocked: "bg-amber",
  in_progress: "bg-accent",
  done: "bg-blue/60",
};

interface SortableTaskCardProps {
  task: Task;
  onClick: () => void;
}

function SortableTaskCard({ task, onClick }: SortableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} onClick={onClick} />
    </div>
  );
}

interface KanbanColumnProps {
  column: string;
  label: string;
  tasks: Task[];
  onTaskClick: (taskId: string) => void;
}

export function KanbanColumn({
  column,
  label,
  tasks,
  onTaskClick,
}: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({ id: column });

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Column header: stripe + mono label + serif count */}
      <div className="flex items-center gap-2 border-b border-edge-soft px-3 py-3">
        <span
          aria-hidden
          className={`inline-block h-3 w-[3px] ${COLUMN_STRIPE[column] ?? "bg-whisper"}`}
        />
        <span className="type-label text-mute">{label}</span>
        <span className="ml-auto type-numeral text-ink" style={{ fontSize: "16px" }}>
          {tasks.length}
        </span>
      </div>

      {/* Task list */}
      <div
        ref={setNodeRef}
        className="flex flex-1 flex-col gap-2 overflow-y-auto p-3"
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              onClick={() => onTaskClick(task.id)}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <p className="py-8 text-center type-micro text-whisper">No tasks</p>
        )}
      </div>
    </div>
  );
}
