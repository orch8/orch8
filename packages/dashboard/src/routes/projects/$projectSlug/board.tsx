import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { KanbanBoard } from "../../../components/kanban/KanbanBoard.js";

function BoardPage() {
  const { projectSlug: projectId } = Route.useParams();
  const navigate = useNavigate();

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto">
        <KanbanBoard
          projectId={projectId}
          onTaskSelect={(taskId) =>
            navigate({
              to: "/projects/$projectSlug/tasks/$taskId",
              params: { projectSlug: projectId, taskId },
            })
          }
        />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectSlug/board")({
  component: BoardPage,
});
