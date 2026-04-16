import { BaseConfirmCard } from "../BaseConfirmCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function ConfirmCreateAgentCard({
  card,
  extracted,
  chatId,
  projectId,
}: CardComponentProps<"confirm_create_agent">) {
  const p = card.payload;
  return (
    <BaseConfirmCard
      title={`Create agent ${p.id}`}
      summary={card.summary}
      extracted={extracted}
      chatId={chatId}
      projectId={projectId}
    >
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-zinc-500">name</dt>
        <dd className="text-zinc-100">{p.name}</dd>
        <dt className="text-zinc-500">role</dt>
        <dd className="text-zinc-300">{p.role}</dd>
        <dt className="text-zinc-500">model</dt>
        <dd className="text-zinc-300">{p.model}</dd>
        {p.heartbeatEnabled && (
          <>
            <dt className="text-zinc-500">heartbeat</dt>
            <dd className="text-zinc-300">
              every {Math.round((p.heartbeatIntervalSec ?? 0) / 60)} min
            </dd>
          </>
        )}
        {p.maxTurns != null && (
          <>
            <dt className="text-zinc-500">maxTurns</dt>
            <dd className="text-zinc-300">{p.maxTurns}</dd>
          </>
        )}
        {p.budgetLimitUsd != null && (
          <>
            <dt className="text-zinc-500">budget</dt>
            <dd className="text-zinc-300">${p.budgetLimitUsd.toFixed(2)}</dd>
          </>
        )}
        {p.desiredSkills && p.desiredSkills.length > 0 && (
          <>
            <dt className="text-zinc-500">skills</dt>
            <dd className="text-zinc-300">{p.desiredSkills.join(", ")}</dd>
          </>
        )}
      </dl>
    </BaseConfirmCard>
  );
}
