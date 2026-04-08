import { BaseInfoCard } from "../BaseInfoCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function InfoCostSummaryCard({ card }: CardComponentProps<"info_cost_summary">) {
  const { totalSpentUsd, period, byAgent } = card.payload;
  return (
    <BaseInfoCard
      title={`$${totalSpentUsd.toFixed(2)} spent${period ? ` this ${period}` : ""}`}
      summary={card.summary}
    >
      <ul className="space-y-1 text-xs">
        {byAgent.map((a) => (
          <li key={a.agentId} className="flex items-center gap-2">
            <span className="font-mono text-zinc-400">{a.agentId}</span>
            <span className="text-zinc-200">{a.name}</span>
            <span className="ml-auto text-zinc-300">${a.spentUsd.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </BaseInfoCard>
  );
}
