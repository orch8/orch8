interface BudgetGaugeProps {
  label: string;
  spent: number;
  limit: number;
}

export function BudgetGauge({ label, spent, limit }: BudgetGaugeProps) {
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
  const color =
    pct >= 90
      ? "bg-red-600"
      : pct >= 70
        ? "bg-yellow-600"
        : "bg-emerald-600";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-300">{label}</span>
        <span className="text-xs text-zinc-500">{Math.round(pct)}%</span>
      </div>
      <div className="mb-2 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-zinc-500">
        ${spent.toFixed(2)} / ${limit.toFixed(2)}
      </p>
    </div>
  );
}
