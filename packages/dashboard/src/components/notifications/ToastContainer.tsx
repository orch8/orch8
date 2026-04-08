import { useEffect } from "react";
import { useToastStore, type Toast } from "../../stores/toast.js";

const TYPE_STRIPE: Record<string, string> = {
  verification_failed: "bg-red",
  verification_passed: "bg-accent",
  agent_failure: "bg-red",
  budget_exceeded: "bg-red",
  budget_warning: "bg-amber",
  task_completed: "bg-accent",
  stuck_task: "bg-amber",
  brainstorm_ready: "bg-blue",
};

const AUTO_DISMISS_MS = 5000;

function ToastItem({ toast }: { toast: Toast }) {
  const remove = useToastStore((s) => s.remove);

  useEffect(() => {
    const timer = setTimeout(() => remove(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, remove]);

  return (
    <div
      data-testid="toast-item"
      data-toast
      className="relative overflow-hidden rounded-md border border-edge-soft bg-surface px-4 py-3 shadow-lg"
    >
      <span
        aria-hidden
        className={`absolute left-0 top-0 h-full w-[3px] ${TYPE_STRIPE[toast.type] ?? "bg-whisper"}`}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="type-label text-mute">{toast.title}</p>
          <p className="mt-1 truncate type-body text-ink">{toast.message}</p>
        </div>
        <button
          onClick={() => remove(toast.id)}
          aria-label="Dismiss"
          className="focus-ring shrink-0 type-mono text-whisper hover:text-mute"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const visible = toasts.slice(0, 3);

  if (visible.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-[100] flex w-80 flex-col gap-2">
      {visible.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
