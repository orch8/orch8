import { BaseInfoCard } from "../BaseInfoCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function InfoBudgetStatusCard({ card }: CardComponentProps<"info_budget_status">) {
  const { entries } = card.payload;
  return (
    <BaseInfoCard title={`${entries.length} budget entries`} summary={card.summary}>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-500">
            <th className="py-1 text-left font-normal">Entity</th>
            <th className="py-1 text-right font-normal">Spent</th>
            <th className="py-1 text-right font-normal">Limit</th>
            <th className="py-1 text-right font-normal">Used</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.entityId}>
              <td className="py-1 text-zinc-200">
                {e.name}
                {e.paused && (
                  <span className="ml-1 rounded bg-amber-900/40 px-1 py-0.5 text-[10px] text-amber-200">
                    paused
                  </span>
                )}
              </td>
              <td className="py-1 text-right text-zinc-300">
                ${e.spentUsd.toFixed(2)}
              </td>
              <td className="py-1 text-right text-zinc-300">
                {e.limitUsd != null ? `$${e.limitUsd.toFixed(2)}` : "—"}
              </td>
              <td className="py-1 text-right text-zinc-300">
                {e.percentUsed != null ? `${e.percentUsed.toFixed(0)}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </BaseInfoCard>
  );
}
