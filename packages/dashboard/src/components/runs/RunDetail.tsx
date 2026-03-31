import { useRun, useRunLog } from "../../hooks/useRuns.js";

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-zinc-800 text-zinc-400",
  running: "bg-blue-900/50 text-blue-300",
  succeeded: "bg-emerald-900/50 text-emerald-300",
  failed: "bg-red-900/50 text-red-300",
  timed_out: "bg-yellow-900/50 text-yellow-300",
  cancelled: "bg-zinc-800 text-zinc-500",
};

interface RunDetailProps {
  runId: string;
  projectId: string;
  onClose: () => void;
}

export function RunDetail({ runId, projectId, onClose }: RunDetailProps) {
  const { data: run } = useRun(runId, projectId);
  const { data: logData } = useRunLog(runId, projectId);

  if (!run) return null;

  const duration =
    run.startedAt && run.finishedAt
      ? Math.round(
          (new Date(run.finishedAt).getTime() -
            new Date(run.startedAt).getTime()) /
            1000,
        )
      : null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-mono text-sm font-semibold text-zinc-200">{run.id}</h3>
          <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs ${STATUS_COLORS[run.status] ?? ""}`}>
            {run.status}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-zinc-600">Agent</span>
          <p className="text-zinc-300">{run.agentId}</p>
        </div>
        <div>
          <span className="text-zinc-600">Task</span>
          <p className="text-zinc-300">{run.taskId ?? "—"}</p>
        </div>
        <div>
          <span className="text-zinc-600">Source</span>
          <p className="text-zinc-300">{run.invocationSource}</p>
        </div>
        <div>
          <span className="text-zinc-600">Duration</span>
          <p className="text-zinc-300">{duration != null ? `${duration}s` : "—"}</p>
        </div>
        <div>
          <span className="text-zinc-600">Cost</span>
          <p className="text-zinc-300">{run.costUsd != null ? `$${run.costUsd.toFixed(4)}` : "—"}</p>
        </div>
        <div>
          <span className="text-zinc-600">Exit Code</span>
          <p className="text-zinc-300">{run.exitCode ?? "—"}</p>
        </div>
      </div>

      {run.error && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-red-400">Error</h4>
          <pre className="rounded bg-red-950/30 p-2 text-xs text-red-300">{run.error}</pre>
        </div>
      )}

      {run.parentRunId && (
        <p className="text-xs text-zinc-500">Continuation of run {run.parentRunId}</p>
      )}

      {logData?.log && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Log Output</h4>
          <pre className="max-h-96 overflow-auto rounded bg-zinc-950 p-3 font-mono text-xs text-zinc-400">
            {logData.log}
          </pre>
        </div>
      )}
    </div>
  );
}
