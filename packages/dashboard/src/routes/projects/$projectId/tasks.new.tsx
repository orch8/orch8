import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCreateTask } from "../../../hooks/useTasks.js";
import {
  TaskForm,
  emptyTaskFormValues,
  type TaskFormValues,
} from "../../../components/task-form/TaskForm.js";
import { PageHeader } from "../../../components/ui/PageHeader.js";
import type { CreateTask } from "@orch/shared";

function NewTaskRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const createTask = useCreateTask();

  async function handleSubmit(values: TaskFormValues) {
    const payload: CreateTask = {
      projectId,
      title: values.title.trim(),
      description: values.description,
      taskType: values.taskType,
      priority: values.priority,
      assignee: values.assignee || undefined,
      autoCommit: values.autoCommit,
      autoPr: values.autoPr,
      finishStrategy: values.finishStrategy || null,
      mcpTools: values.mcpTools,
      linkedIssueIds: values.linkedIssueIds.length
        ? values.linkedIssueIds
        : undefined,
      dependsOn: values.dependsOn.length ? values.dependsOn : undefined,
    };

    const task = await createTask.mutateAsync(payload);
    navigate({
      to: "/projects/$projectId/tasks/$taskId",
      params: { projectId, taskId: task.id },
    });
  }

  return (
    <div className="flex h-full flex-col p-4">
      <PageHeader title="New task" />
      <div className="mb-4">
        <Link
          to="/projects/$projectId/board"
          params={{ projectId }}
          className="focus-ring type-ui text-mute hover:text-ink"
        >
          ← Back to board
        </Link>
      </div>
      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto">
        <TaskForm
          mode="create"
          projectId={projectId}
          initialValues={emptyTaskFormValues()}
          onSubmit={handleSubmit}
          onCancel={() =>
            navigate({
              to: "/projects/$projectId/board",
              params: { projectId },
            })
          }
          isSubmitting={createTask.isPending}
        />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/tasks/new")({
  component: NewTaskRoute,
});
