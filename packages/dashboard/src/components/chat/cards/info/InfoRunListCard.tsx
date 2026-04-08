import { BaseInfoCard } from "../BaseInfoCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function InfoRunListCard({ card }: CardComponentProps<"info_run_list">) {
  const { runs } = card.payload;
  return (
    <BaseInfoCard title={`${runs.length} runs`} summary={card.summary}>
      <ul className="space-y-1 text-xs">
        {runs.map((r) => (
          <li key={r.id} className="flex items-center gap-2">
            <span className="font-mono text-sky-400">{r.id}</span>
            <span className="text-zinc-300">{r.agentName ?? r.agentId}</span>
            <span className="ml-auto rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
              {r.status}
            </span>
            {r.costUsd != null && (
              <span className="text-[10px] text-zinc-500">
                ${r.costUsd.toFixed(3)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </BaseInfoCard>
  );
}
