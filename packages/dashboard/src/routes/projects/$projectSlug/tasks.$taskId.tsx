import { createFileRoute, Link } from "@tanstack/react-router";
import { useTask } from "../../../hooks/useTasks.js";
import { TaskPage } from "../../../components/task-page/TaskPage.js";
import { PageHeader } from "../../../components/ui/PageHeader.js";

function TaskDetailRoute() {
  const { projectSlug: projectId, taskId } = Route.useParams();
  const { data: task, isLoading } = useTask(taskId);

  if (isLoading) {
    return <p className="p-[var(--gap-section)] type-body text-whisper">Loading task...</p>;
  }

  if (!task) {
    return <p className="p-[var(--gap-section)] type-body text-mute">Task not found.</p>;
  }

  return (
    <div className="flex h-full flex-col p-4">
      <PageHeader title="Task detail" subtitle={task.title} />
      <div className="mb-4">
        <Link
          to="/projects/$projectSlug/board"
          params={{ projectSlug: projectId }}
          className="focus-ring type-ui text-mute hover:text-ink"
        >
          ← Back to board
        </Link>
      </div>
      <TaskPage task={task} projectId={projectId} />
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectSlug/tasks/$taskId")({
  component: TaskDetailRoute,
});
