import { BaseInfoCard } from "../BaseInfoCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function InfoRunDetailCard({ card }: CardComponentProps<"info_run_detail">) {
  const { run } = card.payload;
  return (
    <BaseInfoCard title={`Run ${run.id}`} summary={card.summary}>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-zinc-500">agent</dt>
        <dd className="text-zinc-100">{run.agentName ?? run.agentId}</dd>
        <dt className="text-zinc-500">status</dt>
        <dd className="text-zinc-300">{run.status}</dd>
        <dt className="text-zinc-500">started</dt>
        <dd className="text-zinc-300">{run.startedAt}</dd>
        {run.durationSec != null && (
          <>
            <dt className="text-zinc-500">duration</dt>
            <dd className="text-zinc-300">{run.durationSec}s</dd>
          </>
        )}
        {run.costUsd != null && (
          <>
            <dt className="text-zinc-500">cost</dt>
            <dd className="text-zinc-300">${run.costUsd.toFixed(4)}</dd>
          </>
        )}
        {run.error && (
          <>
            <dt className="text-zinc-500">error</dt>
            <dd className="text-red-300">{run.error}</dd>
          </>
        )}
      </dl>
    </BaseInfoCard>
  );
}
