import { createFileRoute, Link } from "@tanstack/react-router";
import { useTask } from "../../../hooks/useTasks.js";
import { TaskPage } from "../../../components/task-page/TaskPage.js";

function TaskDetailRoute() {
  const { projectId, taskId } = Route.useParams();
  const { data: task, isLoading } = useTask(taskId);

  if (isLoading) {
    return <p className="p-8 text-sm text-zinc-600">Loading task...</p>;
  }

  if (!task) {
    return <p className="p-8 text-sm text-zinc-500">Task not found.</p>;
  }

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4">
        <Link
          to="/projects/$projectId/board"
          params={{ projectId }}
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          ← Back to board
        </Link>
      </div>
      <TaskPage task={task} projectId={projectId} />
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/tasks/$taskId")({
  component: TaskDetailRoute,
});
