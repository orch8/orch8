import { useRuns } from "../../hooks/useRuns.js";

interface RunsTabProps {
  taskId: string;
  projectId: string;
}

export function RunsTab({ taskId, projectId }: RunsTabProps) {
  const { data: runs, isLoading } = useRuns(projectId, { taskId });

  if (isLoading) return <p className="text-sm text-zinc-600">Loading runs...</p>;

  if (!runs || runs.length === 0) {
    return <p className="text-sm text-zinc-500">No runs for this task yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {runs.map((run) => (
        <div
          key={run.id}
          className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                run.status === "succeeded" ? "bg-emerald-900/50 text-emerald-300"
                  : run.status === "failed" ? "bg-red-900/50 text-red-300"
                  : run.status === "running" ? "bg-blue-900/50 text-blue-300"
                  : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {run.status}
            </span>
            <span className="text-sm text-zinc-300">{run.agentId}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            {run.costUsd != null && <span>${run.costUsd.toFixed(4)}</span>}
            {run.startedAt && <span>{new Date(run.startedAt).toLocaleString()}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
