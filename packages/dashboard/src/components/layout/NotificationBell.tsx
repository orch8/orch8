import { useState, useMemo, useRef, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useNotifications, useMarkNotificationsRead } from "../../hooks/useNotifications.js";

interface NotificationBellProps {
  projectId: string | null;
}

function relativeTime(dateStr: string | Date): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const TYPE_ICONS: Record<string, string> = {
  verification_failed: "❌",
  verification_passed: "✅",
  budget_warning: "⚠️",
  budget_exceeded: "🚫",
  agent_failure: "💥",
  brainstorm_ready: "💡",
  task_completed: "🎉",
  stuck_task: "🔒",
};

export function NotificationBell({ projectId }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { data: notifications } = useNotifications(projectId);
  const markRead = useMarkNotificationsRead();

  const unreadCount = useMemo(
    () => notifications?.filter((n) => !n.read).length ?? 0,
    [notifications],
  );

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen(!open)}
        className="relative rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
      >
        {/* Bell SVG */}
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path
            d="M9 2a5 5 0 0 0-5 5v2.5L3 11v1h12v-1l-1-1.5V7a5 5 0 0 0-5-5Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M7 13a2 2 0 1 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-80 rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
            <span className="text-xs font-semibold text-zinc-300">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markRead.mutate({ all: true })}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {(!notifications || notifications.length === 0) && (
              <p className="px-3 py-4 text-center text-xs text-zinc-600">
                No notifications
              </p>
            )}
            {notifications?.map((ntf) => (
              <Link
                key={ntf.id}
                to={ntf.link ?? "/"}
                className={`flex gap-2 px-3 py-2 text-sm hover:bg-zinc-800 ${
                  !ntf.read ? "bg-zinc-800/40" : ""
                }`}
                onClick={() => setOpen(false)}
              >
                <span className="shrink-0 text-sm">
                  {TYPE_ICONS[ntf.type] ?? "📌"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-zinc-200">{ntf.title}</p>
                  <p className="truncate text-xs text-zinc-500">{ntf.message}</p>
                  <p className="mt-0.5 text-xs text-zinc-600">{relativeTime(ntf.createdAt)}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
