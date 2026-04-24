import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { BellIcon } from "lucide-react";
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
  const router = useRouter();

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
        <BellIcon className="size-4.5" />

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
            {notifications?.map((ntf) => {
              const href = ntf.link ?? "/";
              const itemClass = `flex flex-col gap-0.5 border-b border-dashed border-edge-soft px-3 py-2 last:border-0 hover:bg-surface-2 text-left ${
                !ntf.read ? "bg-surface-2" : ""
              }`;
              // `ntf.link` is a free-form string from the daemon, so we can't
              // type it against the route tree. Use a plain anchor for
              // semantics/middle-click and fall back to client-side navigation
              // on primary click. Guard navigate() because TanStack Router
              // throws if the link resolves to a param-bearing route that
              // this caller can't supply params for.
              return (
                <a
                  key={ntf.id}
                  href={href}
                  className={itemClass}
                  onClick={(e) => {
                    // Let the browser handle modifier/middle clicks.
                    if (
                      e.defaultPrevented ||
                      e.button !== 0 ||
                      e.metaKey ||
                      e.ctrlKey ||
                      e.shiftKey ||
                      e.altKey
                    ) {
                      return;
                    }
                    e.preventDefault();
                    setOpen(false);
                    try {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      router.navigate({ to: href as any });
                    } catch {
                      // Unknown/param-bearing route — fall back to a hard nav.
                      window.location.href = href;
                    }
                  }}
                >
                  <p className="truncate type-body text-ink">{ntf.title}</p>
                  <p className="truncate type-micro text-mute">{ntf.message}</p>
                  <p className="type-mono text-whisper">
                    {relativeTime(ntf.createdAt)}
                  </p>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
