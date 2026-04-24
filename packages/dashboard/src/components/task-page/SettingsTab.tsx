import { useMemo } from "react";
import { useUpdateTask } from "../../hooks/useTasks.js";
import {
  TaskForm,
  type TaskFormValues,
} from "../task-form/TaskForm.js";
import type { Task } from "../../types.js";
import type { UpdateTask } from "@orch/shared";

interface SettingsTabProps {
  task: Task;
}

export function SettingsTab({ task }: SettingsTabProps) {
  const updateTask = useUpdateTask();

  const initialValues = useMemo<TaskFormValues>(
    () => ({
      title: task.title,
      description: task.description ?? "",
      taskType: task.taskType === "brainstorm" ? "brainstorm" : "quick",
      priority: task.priority ?? "medium",
      assignee: task.assignee ?? "",
      autoCommit: task.autoCommit,
      autoPr: task.autoPr,
      finishStrategy: (task.finishStrategy as TaskFormValues["finishStrategy"]) ?? "",
      mcpTools: task.mcpTools ?? [],
      linkedIssueIds: task.linkedIssueIds ?? [],
      dependsOn: [],
    }),
    [task],
  );

  async function handleSubmit(values: TaskFormValues) {
    const patch: UpdateTask & { taskId: string } = {
      taskId: task.id,
      title: values.title.trim(),
      description: values.description,
      priority: values.priority,
      assignee: values.assignee ? values.assignee : null,
      autoCommit: values.autoCommit,
      autoPr: values.autoPr,
      finishStrategy: values.finishStrategy || null,
      mcpTools: values.mcpTools,
      linkedIssueIds: values.linkedIssueIds,
    };
    await updateTask.mutateAsync(patch);
  }

  return (
    <TaskForm
      mode="edit"
      projectId={task.projectId}
      initialValues={initialValues}
      onSubmit={handleSubmit}
      isSubmitting={updateTask.isPending}
    />
  );
}
