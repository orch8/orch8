import type { ReactNode } from "react";

export type ChipStatus =
  | "running"
  | "paused"
  | "failed"
  | "queued"
  | "idle"
  | "ok"
  | "info"
  | "warn"
  | "err";

const DOT_COLOR: Record<ChipStatus, string> = {
  running: "bg-accent",
  paused: "bg-mute",
  failed: "bg-red",
  queued: "bg-blue",
  idle: "bg-whisper",
  ok: "bg-accent",
  info: "bg-blue",
  warn: "bg-amber",
  err: "bg-red",
};

interface ChipProps {
  status?: ChipStatus;
  children: ReactNode;
  className?: string;
}

export function Chip({ status, children, className = "" }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-xs border border-edge-soft bg-surface px-1.5 py-0.5 type-label text-mute ${className}`}
    >
      {status && (
        <span
          aria-hidden
          className={`inline-block h-1.5 w-1.5 rounded-full ${DOT_COLOR[status]}`}
        />
      )}
      {children}
    </span>
  );
}
