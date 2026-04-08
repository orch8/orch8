import type { ReactNode } from "react";

interface CardProps {
  title?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Card({ title, meta, actions, children, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-md border border-edge-soft bg-surface transition-colors hover:border-edge ${className}`}
    >
      {(title || meta || actions) && (
        <div className="flex items-start justify-between gap-4 border-b border-edge-soft px-4 py-3">
          <div className="min-w-0">
            {title && <div className="type-section text-ink">{title}</div>}
            {meta && <div className="type-label text-whisper">{meta}</div>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      <div className="px-4 py-3 type-body text-ink">{children}</div>
    </div>
  );
}
