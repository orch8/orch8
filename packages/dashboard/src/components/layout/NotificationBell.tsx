import { useState, useMemo, useRef, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import {
  useNotifications,
  useMarkNotificationsRead,
} from "../../hooks/useNotifications.js";

interface NotificationBellProps {
  projectId: string;
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

export function NotificationBell({ projectId }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { data: notifications } = useNotifications(projectId);
  const markRead = useMarkNotificationsRead();

  const unreadCount = useMemo(
    () => notifications?.filter((n) => !n.read).length ?? 0,
    [notifications],
  );

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
        className="focus-ring relative rounded-sm p-1.5 text-mute hover:bg-surface-2 hover:text-ink"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path
            d="M9 2a5 5 0 0 0-5 5v2.5L3 11v1h12v-1l-1-1.5V7a5 5 0 0 0-5-5Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M7 13a2 2 0 1 0 4 0"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>

        {/* Spec: amber dot for unread. No count, no filled red badge. */}
        {unreadCount > 0 && (
          <span
            aria-label={`${unreadCount} unread`}
            className="absolute -right-0.5 -top-0.5 inline-block h-2 w-2 rounded-full bg-amber"
          />
        )}
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-80 rounded-md border border-edge-soft bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-edge-soft px-3 py-2">
            <span className="type-label text-mute">NOTIFICATIONS</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markRead.mutate({ all: true })}
                className="focus-ring type-ui text-accent hover:text-[color:var(--color-accent-hover)]"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {(!notifications || notifications.length === 0) && (
              <p className="px-3 py-4 text-center type-micro text-whisper">
                No notifications
              </p>
            )}
            {notifications?.map((ntf) => (
              <Link
                key={ntf.id}
                to={(ntf.link ?? "/") as any}
                className={`flex flex-col gap-0.5 border-b border-dashed border-edge-soft px-3 py-2 last:border-0 hover:bg-surface-2 ${
                  !ntf.read ? "bg-surface-2" : ""
                }`}
                onClick={() => setOpen(false)}
              >
                <p className="truncate type-body text-ink">{ntf.title}</p>
                <p className="truncate type-micro text-mute">{ntf.message}</p>
                <p className="type-mono text-whisper">
                  {relativeTime(ntf.createdAt)}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
