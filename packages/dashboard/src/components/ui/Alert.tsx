import type { ReactNode } from "react";

export type AlertVariant = "ok" | "warn" | "err" | "info";

const STRIPE: Record<AlertVariant, string> = {
  ok: "bg-accent",
  warn: "bg-amber",
  err: "bg-red",
  info: "bg-blue",
};

interface AlertProps {
  title: ReactNode;
  variant: AlertVariant;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function Alert({
  title,
  variant,
  children,
  actions,
  className = "",
}: AlertProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-md border border-edge-soft bg-surface pl-4 pr-4 py-3 ${className}`}
    >
      <span
        data-stripe
        className={`absolute left-0 top-0 h-full w-[3px] ${STRIPE[variant]}`}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="type-label text-mute">{title}</div>
          {children && <div className="mt-1 type-body text-ink">{children}</div>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
