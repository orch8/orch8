import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { KanbanBoard } from "../../../components/kanban/KanbanBoard.js";

function BoardPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto">
        <KanbanBoard
          projectId={projectId}
          onTaskSelect={(taskId) =>
            navigate({
              to: "/projects/$projectId/tasks/$taskId",
              params: { projectId, taskId },
            })
          }
        />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/board")({
  component: BoardPage,
});
