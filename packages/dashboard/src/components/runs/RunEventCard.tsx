import { useState } from "react";
import type { RunEvent } from "../../types.js";

// Concrete fallback so the card never crashes if a known key (e.g. `init`)
// gets renamed or removed from this map.
const DEFAULT_ICON = { icon: "•", color: "text-zinc-400" } as const;

const EVENT_ICONS: Record<string, { icon: string; color: string }> = {
  init:           { icon: "⚡", color: "text-blue-400" },
  tool_use:       { icon: "🔧", color: "text-amber-400" },
  tool_result:    { icon: "📋", color: "text-green-400" },
  assistant_text: { icon: "💬", color: "text-purple-400" },
  result:         { icon: "✅", color: "text-emerald-400" },
  error:          { icon: "❌", color: "text-red-400" },
};

const TOOL_ICONS: Record<string, string> = {
  Read: "📖",
  Edit: "✏️",
  Write: "📝",
  Bash: "💻",
  Grep: "🔍",
  Glob: "📁",
  WebSearch: "🌐",
  WebFetch: "🌐",
  Agent: "🤖",
};

function formatTimestamp(ts: string, baseTs?: string): string {
  if (!baseTs) return new Date(ts).toLocaleTimeString();
  const diff = Math.round((new Date(ts).getTime() - new Date(baseTs).getTime()) / 1000);
  if (diff < 60) return `+${diff}s`;
  if (diff < 3600) return `+${Math.floor(diff / 60)}m ${diff % 60}s`;
  return `+${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

interface RunEventCardProps {
  event: RunEvent;
  baseTimestamp?: string;
}

export function RunEventCard({ event, baseTimestamp }: RunEventCardProps) {
  const [expanded, setExpanded] = useState(false);

  const { icon: defaultIcon, color } = EVENT_ICONS[event.eventType] ?? DEFAULT_ICON;
  const icon = event.toolName ? (TOOL_ICONS[event.toolName] ?? defaultIcon) : defaultIcon;

  return (
    <div className="group flex gap-3">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <span className={`text-sm ${color}`}>{icon}</span>
        <div className="w-px flex-1 bg-zinc-800" />
      </div>

      {/* Card — styled as a div, but a real <button> for a11y. */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="mb-3 flex-1 cursor-pointer rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-left transition-colors hover:border-zinc-700"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-200">
            {event.summary.split(/(\S+\.\w+|\/\S+)/).map((part, i) =>
              /(\S+\.\w+|\/\S+)/.test(part)
                ? <code key={i} className="font-mono text-xs text-zinc-400">{part}</code>
                : <span key={i}>{part}</span>
            )}
          </span>
          <span className="ml-2 shrink-0 text-xs text-zinc-600">
            {formatTimestamp(event.timestamp, baseTimestamp)}
          </span>
        </div>

        {expanded && event.payload != null && (
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-zinc-950 p-2 font-mono text-xs text-zinc-400">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        )}
      </button>
    </div>
  );
}
