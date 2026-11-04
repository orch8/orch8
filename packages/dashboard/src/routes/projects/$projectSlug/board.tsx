import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { KanbanBoard } from "../../../components/kanban/KanbanBoard.js";

function BoardPage() {
  const { projectSlug: projectId } = Route.useParams();
  const navigate = useNavigate();

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3">
          <p className="text-sm text-zinc-400">Tasks and agent activity</p>
          <Link to="/projects/$projectSlug/pipelines" params={{ projectSlug: projectId }} className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white">Build a feature</Link>
        </div>
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
