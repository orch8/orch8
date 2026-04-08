import { BaseInfoCard } from "../BaseInfoCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function InfoMemorySearchCard({ card }: CardComponentProps<"info_memory_search">) {
  const { query, results } = card.payload;
  return (
    <BaseInfoCard title={`${results.length} results for "${query}"`} summary={card.summary}>
      <ul className="space-y-2 text-xs">
        {results.map((r) => (
          <li key={r.id}>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
              {r.kind}
            </span>{" "}
            <span className="font-mono text-zinc-500">{r.id}</span>
            <p className="mt-0.5 text-zinc-300">{r.snippet}</p>
          </li>
        ))}
      </ul>
    </BaseInfoCard>
  );
}
