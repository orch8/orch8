import type { ReactNode } from "react";

export interface StatItem {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
}

interface StatGridProps {
  items: StatItem[];
  className?: string;
}

export function StatGrid({ items, className = "" }: StatGridProps) {
  return (
    <div
      // 1px gap on edge-soft bg creates the etched-plate look without heavy borders.
      className={`grid gap-px overflow-hidden rounded-md bg-edge-soft sm:grid-cols-2 lg:grid-cols-4 ${className}`}
    >
      {items.map((item, i) => (
        <div
          key={`${item.label}-${i}`}
          className="flex flex-col gap-1 bg-surface px-4 py-4"
        >
          <span className="type-micro text-whisper">{item.label}</span>
          <span className="type-numeral text-ink">{item.value}</span>
          {item.delta && <span className="type-micro text-mute">{item.delta}</span>}
        </div>
      ))}
    </div>
  );
}
