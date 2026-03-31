import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useActivity } from "../../../hooks/useActivity.js";

const LEVEL_COLORS: Record<string, string> = {
  info: "bg-blue-500",
  warn: "bg-yellow-500",
  error: "bg-red-500",
};

const PAGE_SIZE = 50;

function ActivityPage() {
  const { projectId } = Route.useParams();
  const [levelFilter, setLevelFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [offset, setOffset] = useState(0);

  const { data: entries, isLoading } = useActivity(projectId, {
    level: levelFilter || undefined,
    agentId: agentFilter || undefined,
    limit: PAGE_SIZE,
    offset,
  });

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Activity Log</h2>

      {/* Filters */}
      <div className="flex gap-2">
        <select
          value={levelFilter}
          onChange={(e) => {
            setLevelFilter(e.target.value);
            setOffset(0);
          }}
          aria-label="Filter by level"
          className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300"
        >
          <option value="">All levels</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>

        <input
          value={agentFilter}
          onChange={(e) => {
            setAgentFilter(e.target.value);
            setOffset(0);
          }}
          placeholder="Filter by agent..."
          aria-label="Filter by agent"
          className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300 placeholder-zinc-600"
        />
      </div>

      {isLoading && (
        <p className="text-sm text-zinc-600">Loading activity...</p>
      )}

      {/* Table */}
      <div className="overflow-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
              <th className="w-8 px-3 py-2">Level</th>
              <th className="px-3 py-2">Timestamp</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Event</th>
            </tr>
          </thead>
          <tbody>
            {entries?.map((entry) => (
              <tr key={entry.id} className="border-b border-zinc-800/50">
                <td className="px-3 py-2">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${LEVEL_COLORS[entry.level] ?? "bg-zinc-500"}`}
                  />
                </td>
                <td className="px-3 py-2 text-xs text-zinc-500">
                  {new Date(entry.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-xs text-zinc-400">
                  {entry.agentId ?? "system"}
                </td>
                <td className="px-3 py-2 text-zinc-300">{entry.message}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {entries?.length === 0 && !isLoading && (
          <p className="py-8 text-center text-sm text-zinc-600">
            No activity found
          </p>
        )}
      </div>

      {/* Pagination */}
      <div className="flex justify-between">
        <button
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          disabled={offset === 0}
          className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
        >
          Newer
        </button>
        <button
          onClick={() => setOffset(offset + PAGE_SIZE)}
          disabled={(entries?.length ?? 0) < PAGE_SIZE}
          className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
        >
          Older
        </button>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/activity")({
  component: ActivityPage,
});
