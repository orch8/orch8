interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  indicator?: "green" | "yellow" | "red" | "none";
}

const INDICATOR_COLORS = {
  green: "bg-emerald-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
  none: "",
};

export function StatCard({ label, value, subtitle, indicator = "none" }: StatCardProps) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center gap-2">
        {indicator !== "none" && (
          <span className={`h-2 w-2 rounded-full ${INDICATOR_COLORS[indicator]}`} />
        )}
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold text-zinc-100">{value}</p>
      {subtitle && (
        <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
      )}
    </div>
  );
}
