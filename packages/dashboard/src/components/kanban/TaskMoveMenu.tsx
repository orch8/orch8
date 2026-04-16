import { useEffect, useRef } from "react";
import { KANBAN_COLUMNS, COLUMN_LABELS } from "@orch/shared";
import type { Task } from "../../types.js";

interface TaskMoveMenuProps {
  task: Task;
  onMove: (taskId: string, column: string) => void;
  onClose: () => void;
}

export function TaskMoveMenu({ task, onMove, onClose }: TaskMoveMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const otherColumns = KANBAN_COLUMNS.filter((c) => c !== task.column);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
      <div
        ref={ref}
        role="menu"
        className="relative z-10 mb-4 w-[min(320px,90vw)] rounded-md border border-edge bg-surface p-2 shadow-xl"
      >
        <p className="px-3 py-2 type-label text-whisper">MOVE TO…</p>
        {otherColumns.map((col) => (
          <button
            key={col}
            role="menuitem"
            onClick={() => onMove(task.id, col)}
            className="focus-ring block w-full rounded-sm px-3 py-2 text-left type-body text-ink hover:bg-surface-2"
          >
            {COLUMN_LABELS[col]}
          </button>
        ))}
      </div>
    </div>
  );
}
