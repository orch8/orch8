import type { ReactNode } from "react";
import { Badge } from "./Badge.js";

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
  const variant =
    status === "failed" || status === "err"
      ? "error"
      : status === "warn"
        ? "warning"
        : status === "info" || status === "queued"
          ? "info"
          : status === "running" || status === "ok"
            ? "success"
            : "outline";

  return (
    <Badge variant={variant} size="sm" className={`type-label gap-1.5 ${className}`}>
      {status && (
        <span
          aria-hidden
          className={`inline-block h-1.5 w-1.5 rounded-full ${DOT_COLOR[status]}`}
        />
      )}
      {children}
    </Badge>
  );
}
