import type { ReactNode } from "react";

interface PillProps {
  label: string;
  value: ReactNode;
  className?: string;
}

export function Pill({ label, value, className = "" }: PillProps) {
  return (
    <span
      className={`inline-flex items-baseline gap-2 rounded-sm border border-edge-soft bg-surface px-2.5 py-1 ${className}`}
    >
      <span className="type-micro text-whisper">{label}</span>
      <span className="type-mono text-ink">{value}</span>
    </span>
  );
}
