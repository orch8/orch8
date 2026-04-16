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
import { KANBAN_COLUMNS, COLUMN_LABELS } from "@orch/shared";
import type { Task } from "../../types.js";
import { KanbanColumn } from "./KanbanColumn.js";
import { TaskCard } from "./TaskCard.js";
import { BoardToolbar, type BoardFilters } from "./BoardToolbar.js";
import { PageHeader } from "../ui/PageHeader.js";
import { useBreakpoint } from "../../hooks/useBreakpoint.js";
import { KanbanBoardTabs } from "./KanbanBoardTabs.js";

interface KanbanBoardProps {
  projectId: string;
  onTaskSelect?: (taskId: string) => void;
}

function countByColumn(tasks: Task[] | undefined): Record<string, number> {
  const counts: Record<string, number> = {
    backlog: 0,
    blocked: 0,
    in_progress: 0,
    done: 0,
  };
  for (const t of tasks ?? []) {
    counts[t.column] = (counts[t.column] ?? 0) + 1;
  }
  return counts;
}

function buildSubtitle(tasks: Task[] | undefined): string {
  const total = tasks?.length ?? 0;
  const counts = countByColumn(tasks);
  const pieces: string[] = [
    `${total} ${total === 1 ? "task" : "tasks"} across ${KANBAN_COLUMNS.length} columns`,
  ];
  if (counts.blocked > 0) {
    pieces.push(`${counts.blocked} blocked`);
  }
  if (counts.in_progress > 0) {
    pieces.push(`${counts.in_progress} in progress`);
  }
  return pieces.join(" · ");
}

export function KanbanBoard({ projectId, onTaskSelect }: KanbanBoardProps) {
  const { isNarrow } = useBreakpoint();
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

    const task = tasks?.find((t) => t.id === taskId);
    if (
      task &&
      task.column !== targetColumn &&
      KANBAN_COLUMNS.includes(targetColumn as any)
    ) {
      transition.mutate({ taskId, column: targetColumn });
    }
  }

  if (isNarrow) {
    return (
      <div>
        <PageHeader
          title="Board"
          subtitle={buildSubtitle(tasks)}
          actions={
            <BoardToolbar projectId={projectId} onFilterChange={setFilters} />
          }
        />
        <KanbanBoardTabs
          projectId={projectId}
          onTaskSelect={onTaskSelect}
          filters={filters}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Board"
        subtitle={buildSubtitle(tasks)}
        actions={
          <BoardToolbar projectId={projectId} onFilterChange={setFilters} />
        }
      />
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-4 gap-px overflow-hidden rounded-md bg-edge-soft">
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
    </div>
  );
}
