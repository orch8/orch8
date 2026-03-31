import { useEffect } from "react";
import { useToastStore, type Toast } from "../../stores/toast.js";

const TYPE_COLORS: Record<string, string> = {
  verification_failed: "border-l-red-500",
  verification_passed: "border-l-emerald-500",
  agent_failure: "border-l-red-500",
  budget_exceeded: "border-l-red-500",
  budget_warning: "border-l-yellow-500",
  task_completed: "border-l-emerald-500",
  stuck_task: "border-l-yellow-500",
  brainstorm_ready: "border-l-blue-500",
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
      className={`rounded-lg border border-zinc-800 border-l-4 bg-zinc-900 p-3 shadow-lg ${TYPE_COLORS[toast.type] ?? "border-l-zinc-500"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-100">{toast.title}</p>
          <p className="truncate text-xs text-zinc-400">{toast.message}</p>
        </div>
        <button
          onClick={() => remove(toast.id)}
          aria-label="Dismiss"
          className="shrink-0 text-zinc-600 hover:text-zinc-400"
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
