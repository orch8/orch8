import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  className = "",
}: PageHeaderProps) {
  return (
    <div className={`mb-[var(--gap-section)] flex flex-col gap-[var(--gap-block)] md:flex-row md:items-end md:justify-between ${className}`}>
      <div className="min-w-0">
        <h2 className="type-title text-ink">{title}</h2>
        {subtitle && <p className="mt-1 type-body text-mute">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-[var(--gap-inline)]">{actions}</div>}
    </div>
  );
}
