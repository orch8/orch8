import { useActivity } from "../../hooks/useActivity.js";

interface ActivityTimelineProps {
  projectId: string;
  agentId?: string;
  taskId?: string;
  compact?: boolean;
  limit?: number;
}

const LEVEL_COLORS: Record<string, string> = {
  info: "bg-blue-500",
  warn: "bg-yellow-500",
  error: "bg-red-500",
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ActivityTimeline({
  projectId,
  agentId,
  taskId,
  compact = false,
  limit,
}: ActivityTimelineProps) {
  const { data: entries, isLoading } = useActivity(projectId, {
    agentId,
    taskId,
    limit: limit ?? (compact ? 10 : 50),
  });

  if (isLoading) {
    return <p className="text-xs text-zinc-600">Loading activity...</p>;
  }

  if (!entries || entries.length === 0) {
    return <p className="text-xs text-zinc-600">No activity yet</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex items-start gap-2 rounded px-2 py-1 text-sm"
        >
          <span
            data-level={entry.level}
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${LEVEL_COLORS[entry.level] ?? "bg-zinc-500"}`}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-zinc-500">
                {compact ? relativeTime(entry.createdAt) : new Date(entry.createdAt).toLocaleString()}
              </span>
              {entry.agentId && (
                <span className="text-xs font-medium text-zinc-400">
                  {entry.agentId}
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-300 truncate">{entry.message}</p>
          </div>
        </div>
      ))}

      {compact && (
        <a
          href="/activity"
          className="mt-1 block text-xs text-blue-400 hover:text-blue-300"
        >
          View all activity →
        </a>
      )}
    </div>
  );
}
