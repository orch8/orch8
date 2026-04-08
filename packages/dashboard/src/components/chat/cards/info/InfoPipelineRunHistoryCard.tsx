import { BaseInfoCard } from "../BaseInfoCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function InfoPipelineRunHistoryCard({
  card,
}: CardComponentProps<"info_pipeline_run_history">) {
  const { pipelineId, runs } = card.payload;
  return (
    <BaseInfoCard
      title={`Run history for ${pipelineId}`}
      summary={card.summary}
    >
      <ul className="space-y-1 text-xs">
        {runs.map((r) => (
          <li key={r.runId} className="flex items-center gap-2">
            <span className="font-mono text-zinc-400">{r.runId}</span>
            <span className="text-zinc-300">{r.startedAt}</span>
            <span className="ml-auto rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
              {r.status}
            </span>
            {r.durationSec != null && (
              <span className="text-[10px] text-zinc-500">{r.durationSec}s</span>
            )}
          </li>
        ))}
      </ul>
    </BaseInfoCard>
  );
}
