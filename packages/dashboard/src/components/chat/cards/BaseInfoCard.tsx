import type { ReactNode } from "react";

interface BaseInfoCardProps {
  title: string;
  summary?: string;
  children: ReactNode;
}

export function BaseInfoCard({ title, summary, children }: BaseInfoCardProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 px-4 py-2">
        <div className="text-xs uppercase tracking-widest text-zinc-500">Info</div>
        <div className="text-sm font-semibold text-zinc-100">{title}</div>
        {summary && <div className="mt-0.5 text-xs text-zinc-500">{summary}</div>}
      </div>
      <div className="px-4 py-3 text-sm text-zinc-200">{children}</div>
    </div>
  );
}
