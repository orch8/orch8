import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  body: ReactNode;
  cta?: ReactNode;
  className?: string;
}

export function EmptyState({ title, body, cta, className = "" }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-md border border-edge-soft bg-surface px-6 py-12 text-center ${className}`}
    >
      <span className="type-display text-whisper" aria-hidden>
        —
      </span>
      <h3 className="type-section text-ink">{title}</h3>
      <p className="max-w-md type-body text-mute">{body}</p>
      {cta && <div className="mt-2">{cta}</div>}
    </div>
  );
}
