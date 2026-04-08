import type { ReactNode } from "react";

export type ActivityTagVariant = "ok" | "info" | "warn" | "err" | "neutral";

const TAG_COLOR: Record<ActivityTagVariant, string> = {
  ok: "text-accent",
  info: "text-blue",
  warn: "text-amber",
  err: "text-red",
  neutral: "text-whisper",
};

interface ActivityItemProps {
  tag: string;
  tagVariant?: ActivityTagVariant;
  message: ReactNode;
  timestamp: string;
}

export function ActivityItem({
  tag,
  tagVariant = "neutral",
  message,
  timestamp,
}: ActivityItemProps) {
  return (
    <div className="grid grid-cols-[80px_1fr_auto] items-baseline gap-4 border-b border-dashed border-edge-soft py-3 last:border-0">
      <span className={`type-label ${TAG_COLOR[tagVariant]}`}>{tag}</span>
      <span className="type-body text-ink">{message}</span>
      <span className="type-mono text-whisper">{timestamp}</span>
    </div>
  );
}
