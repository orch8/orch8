import { createFileRoute } from "@tanstack/react-router";
import { KanbanBoard } from "../../../components/kanban/KanbanBoard.js";
import { TaskDetailPanel } from "../../../components/task-detail/TaskDetailPanel.js";

function BoardPage() {
  const { projectId } = Route.useParams();
  const { task: selectedTaskId } = Route.useSearch();

  return (
    <div className="flex h-full gap-4">
      <div className="flex-1 overflow-auto">
        <KanbanBoard projectId={projectId} />
      </div>
      {selectedTaskId && <TaskDetailPanel taskId={selectedTaskId} />}
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/board")({
  component: BoardPage,
  validateSearch: (search: Record<string, unknown>) => ({
    task: typeof search.task === "string" ? search.task : undefined,
  }),
});
