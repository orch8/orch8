import type { ReactNode } from "react";

interface BaseResultCardProps {
  variant: "success" | "error";
  title: string;
  summary?: string;
  children?: ReactNode;
}

export function BaseResultCard({ variant, title, summary, children }: BaseResultCardProps) {
  const palette =
    variant === "success"
      ? "border-emerald-700/60 bg-emerald-950/20"
      : "border-red-800/70 bg-red-950/20";
  const labelPalette =
    variant === "success" ? "text-emerald-300" : "text-red-300";

  return (
    <div className={`overflow-hidden rounded-lg border ${palette}`}>
      <div className="border-b border-zinc-800 px-4 py-2">
        <div className={`text-xs uppercase tracking-widest ${labelPalette}`}>
          {variant === "success" ? "Result" : "Error"}
        </div>
        <div className="text-sm font-semibold text-zinc-100">{title}</div>
        {summary && <div className="mt-0.5 text-xs text-zinc-500">{summary}</div>}
      </div>
      {children && <div className="px-4 py-3 text-sm text-zinc-200">{children}</div>}
    </div>
  );
}
