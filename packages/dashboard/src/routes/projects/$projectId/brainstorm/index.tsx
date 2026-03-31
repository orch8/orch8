import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTasks, useCreateTask } from "../../../../hooks/useTasks.js";
import { ConfirmDialog } from "../../../../components/shared/ConfirmDialog.js";
import { api } from "../../../../api/client.js";

function BrainstormListPage() {
  const { projectId } = Route.useParams();
  const { data: allTasks } = useTasks(projectId);
  const createTask = useCreateTask();
  const [killTarget, setKillTarget] = useState<string | null>(null);

  const brainstormTasks = allTasks?.filter((t) => t.taskType === "brainstorm") ?? [];

  async function handleNewSession() {
    await createTask.mutateAsync({
      projectId,
      title: "New Brainstorm Session",
      taskType: "brainstorm",
      priority: "medium",
    } as any);
  }

  async function handleKill(taskId: string) {
    await api.post(`/brainstorm/${taskId}/kill`, {});
    setKillTarget(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Brainstorm Sessions</h2>
        <button
          onClick={handleNewSession}
          disabled={createTask.isPending}
          className="rounded-md bg-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:bg-zinc-600 disabled:opacity-40"
        >
          + New Session
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {brainstormTasks.length === 0 && (
          <p className="text-sm text-zinc-600">No brainstorm sessions yet.</p>
        )}
        {brainstormTasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-4"
          >
            <div>
              <p className="font-medium text-zinc-100">{task.title}</p>
              <p className="text-xs text-zinc-500">
                {task.brainstormStatus ?? "idle"} · {task.column}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                to="/projects/$projectId/brainstorm/$taskId"
                params={{ projectId, taskId: task.id }}
                className="rounded bg-zinc-700 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-600"
              >
                {task.brainstormStatus === "active" ? "Open Chat" : "Resume"}
              </Link>
              {task.brainstormStatus === "ready" && (
                <>
                  <button
                    onClick={() =>
                      api.post(`/tasks/${task.id}/convert`, { taskType: "quick" })
                    }
                    className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500"
                  >
                    Convert to Quick
                  </button>
                  <button
                    onClick={() =>
                      api.post(`/tasks/${task.id}/convert`, { taskType: "complex" })
                    }
                    className="rounded bg-purple-600 px-3 py-1 text-xs font-medium text-white hover:bg-purple-500"
                  >
                    Convert to Complex
                  </button>
                </>
              )}
              <button
                onClick={() => setKillTarget(task.id)}
                className="rounded bg-red-900/30 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-900/50"
              >
                Kill
              </button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!killTarget}
        title="Kill Brainstorm Session?"
        description="This will terminate the brainstorm process. Any unsaved work will be lost."
        confirmLabel="Kill"
        onConfirm={() => killTarget && handleKill(killTarget)}
        onCancel={() => setKillTarget(null)}
      />
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/brainstorm/")({
  component: BrainstormListPage,
});
