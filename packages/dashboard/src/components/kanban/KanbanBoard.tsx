import { useMemo, useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useTasks, useTransitionTask } from "../../hooks/useTasks.js";
import { KANBAN_COLUMNS, COLUMN_LABELS, type Task } from "../../types.js";
import { KanbanColumn } from "./KanbanColumn.js";
import { TaskCard } from "./TaskCard.js";
import { BoardToolbar, type BoardFilters } from "./BoardToolbar.js";

interface KanbanBoardProps {
  projectId: string;
  onTaskSelect?: (taskId: string) => void;
}

export function KanbanBoard({ projectId, onTaskSelect }: KanbanBoardProps) {
  const { data: tasks } = useTasks(projectId);
  const transition = useTransitionTask();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [filters, setFilters] = useState<BoardFilters>({});
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const tasksByColumn = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    for (const col of KANBAN_COLUMNS) {
      grouped[col] = [];
    }
    if (tasks) {
      for (const task of tasks) {
        if (filters.assignee && task.assignee !== filters.assignee) continue;
        if (filters.priority && task.priority !== filters.priority) continue;
        if (filters.taskType && task.taskType !== filters.taskType) continue;
        if (grouped[task.column]) {
          grouped[task.column].push(task);
        }
      }
    }
    return grouped;
  }, [tasks, filters]);

  function handleDragStart(event: { active: { id: string | number } }) {
    const task = tasks?.find((t) => t.id === event.active.id);
    setActiveTask(task ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const targetColumn = over.id as string;

    // Only transition if dropping into a different column
    const task = tasks?.find((t) => t.id === taskId);
    if (
      task &&
      task.column !== targetColumn &&
      KANBAN_COLUMNS.includes(targetColumn as any)
    ) {
      transition.mutate({ taskId, column: targetColumn });
    }
  }

  return (
    <>
    <BoardToolbar projectId={projectId} onFilterChange={setFilters} />
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {KANBAN_COLUMNS.map((col) => (
          <KanbanColumn
            key={col}
            column={col}
            label={COLUMN_LABELS[col]}
            tasks={tasksByColumn[col] ?? []}
            onTaskClick={onTaskSelect ?? (() => {})}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask && <TaskCard task={activeTask} onClick={() => {}} />}
      </DragOverlay>
    </DndContext>
    </>
  );
}
