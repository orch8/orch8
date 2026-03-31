import { useState } from "react";
import { useRuns } from "../../hooks/useRuns.js";
import { RunDetail } from "./RunDetail.js";

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-zinc-800 text-zinc-400",
  running: "bg-blue-900/50 text-blue-300",
  succeeded: "bg-emerald-900/50 text-emerald-300",
  failed: "bg-red-900/50 text-red-300",
  timed_out: "bg-yellow-900/50 text-yellow-300",
  cancelled: "bg-zinc-800 text-zinc-500",
};

const STATUS_OPTIONS = ["", "queued", "running", "succeeded", "failed", "timed_out", "cancelled"];

interface RunInspectorProps {
  projectId: string | null;
}

export function RunInspector({ projectId }: RunInspectorProps) {
  const [statusFilter, setStatusFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const { data: runs, isLoading } = useRuns(projectId, {
    status: statusFilter || undefined,
    agentId: agentFilter || undefined,
    limit: 100,
  });

  return (
    <div className="flex h-full gap-4">
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300 focus:border-zinc-600 focus:outline-none"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.filter(Boolean).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <input
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            placeholder="Filter by agent..."
            className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
          />
        </div>

        {isLoading && <p className="text-sm text-zinc-600">Loading runs...</p>}

        <div className="overflow-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                <th className="px-3 py-2">Run</th>
                <th className="px-3 py-2">Agent</th>
                <th className="px-3 py-2">Task</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2 text-right">Cost</th>
                <th className="px-3 py-2">Started</th>
              </tr>
            </thead>
            <tbody>
              {runs?.map((run) => (
                <tr
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  className={`cursor-pointer border-b border-zinc-800/50 transition-colors hover:bg-zinc-900 ${
                    selectedRunId === run.id ? "bg-zinc-900" : ""
                  }`}
                >
                  <td className="px-3 py-2 font-mono text-xs text-zinc-400">{run.id}</td>
                  <td className="px-3 py-2 text-zinc-300">{run.agentId}</td>
                  <td className="px-3 py-2 text-zinc-400">{run.taskId ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_COLORS[run.status] ?? ""}`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-zinc-500">{run.invocationSource}</td>
                  <td className="px-3 py-2 text-right text-zinc-400">
                    {run.costUsd != null ? `$${run.costUsd.toFixed(4)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">
                    {run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {runs?.length === 0 && !isLoading && (
            <p className="py-8 text-center text-sm text-zinc-600">No runs found</p>
          )}
        </div>
      </div>

      {selectedRunId && projectId && (
        <div className="w-96 shrink-0">
          <RunDetail
            runId={selectedRunId}
            projectId={projectId}
            onClose={() => setSelectedRunId(null)}
          />
        </div>
      )}
    </div>
  );
}
