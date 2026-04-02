import { useCompleteTask, useConvertTask } from "../../hooks/useVerification.js";

interface TaskActionsProps {
  taskId: string;
  column: string;
  taskType: string;
  brainstormStatus: string | null;
}

export function TaskActions({ taskId, column, taskType, brainstormStatus }: TaskActionsProps) {
  const completeTask = useCompleteTask();
  const convertTask = useConvertTask();

  const showComplete = column === "in_progress";
  const showConvert = taskType === "brainstorm" && brainstormStatus === "ready";

  if (!showComplete && !showConvert) return null;

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Actions
      </h4>
      <div className="flex flex-wrap gap-2">
        {showComplete && (
          <button
            onClick={() => completeTask.mutate(taskId)}
            disabled={completeTask.isPending}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            Mark Complete
          </button>
        )}
        {showConvert && (
          <button
            onClick={() => convertTask.mutate({ taskId, taskType: "quick" })}
            disabled={convertTask.isPending}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            Convert to Quick
          </button>
        )}
      </div>
    </div>
  );
}
