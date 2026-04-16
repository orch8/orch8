import { useRef } from "react";
import type { Task } from "../../types.js";

const PRIORITY_TAG_COLOR: Record<string, string> = {
  high: "text-red border-red",
  medium: "text-amber border-amber",
  low: "text-whisper border-edge",
};

// Spec maps the data-model priority values to displayed P0/P1/P2 labels.
const PRIORITY_LABEL: Record<string, string> = {
  high: "P0",
  medium: "P1",
  low: "P2",
};

const TYPE_LABEL: Record<string, string> = {
  quick: "QUICK",
  brainstorm: "BRAINSTORM",
};

// Left-edge state stripe. Only `blocked` column lights up today —
// sage (verifying) and red (failed) stripes are reserved for future
// status fields on Task but aren't represented in the current data model.
function stripeFor(task: Task): string | null {
  if (task.column === "blocked") return "bg-amber";
  return null;
}

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  onLongPress?: () => void;
}

export function TaskCard({ task, onClick, onLongPress }: TaskCardProps) {
  const stripe = stripeFor(task);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handlePointerDown() {
    if (!onLongPress) return;
    longPressTimer.current = setTimeout(() => {
      onLongPress();
      longPressTimer.current = null;
    }, 500);
  }

  function handlePointerUp() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  return (
    <button
      onClick={onClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="focus-ring relative w-full cursor-pointer overflow-hidden rounded-md border border-edge-soft bg-surface px-3 py-3 text-left transition-colors hover:border-edge hover:bg-surface-2"
    >
      {stripe && (
        <span
          aria-hidden
          className={`absolute left-0 top-0 h-full w-[3px] ${stripe}`}
        />
      )}

      {/* Top row: task ID + priority tag */}
      <div className="mb-2 flex items-center justify-between">
        <span className="type-mono text-whisper">{task.id}</span>
        {task.priority && (
          <span
            className={`rounded-xs border px-1.5 py-0.5 type-label ${
              PRIORITY_TAG_COLOR[task.priority] ?? "text-whisper border-edge"
            }`}
          >
            {PRIORITY_LABEL[task.priority] ?? task.priority}
          </span>
        )}
      </div>

      {/* Middle: serif title */}
      <p className="type-section leading-tight text-ink">
        {task.title}
      </p>

      {/* Foot row: assignee + type tag */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {task.assignee && (
          <span className="inline-flex items-center gap-1.5 type-label text-mute">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
            />
            {task.assignee}
          </span>
        )}
        {task.taskType && (
          <span className="rounded-xs border border-edge-soft px-1.5 py-0.5 type-label text-whisper">
            {TYPE_LABEL[task.taskType] ?? task.taskType.toUpperCase()}
          </span>
        )}
      </div>
    </button>
  );
}
