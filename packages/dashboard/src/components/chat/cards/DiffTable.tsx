interface DiffTableProps {
  current: Record<string, unknown>;
  proposed: Record<string, unknown>;
}

/**
 * Renders a 3-column table: field | current value | proposed value.
 * Unchanged fields are dimmed; changed fields are highlighted.
 * Used by all `confirm_update_*` cards.
 */
export function DiffTable({ current, proposed }: DiffTableProps) {
  const keys = Array.from(
    new Set([...Object.keys(current ?? {}), ...Object.keys(proposed ?? {})]),
  ).sort();

  return (
    <table className="w-full table-fixed text-xs">
      <thead>
        <tr className="border-b border-zinc-800 text-zinc-500">
          <th className="w-1/4 py-1 text-left font-normal">Field</th>
          <th className="w-3/8 py-1 text-left font-normal">Current</th>
          <th className="w-3/8 py-1 text-left font-normal">Proposed</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => {
          const cur = current?.[k];
          const prop = proposed?.[k];
          const changed = JSON.stringify(cur) !== JSON.stringify(prop);
          return (
            <tr
              key={k}
              className={changed ? "text-zinc-100" : "text-zinc-500"}
            >
              <td className="py-1 font-mono">{k}</td>
              <td className="py-1 font-mono">{stringify(cur)}</td>
              <td
                className={`py-1 font-mono ${changed ? "text-emerald-300" : ""}`}
              >
                {stringify(prop)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function stringify(v: unknown): string {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}
