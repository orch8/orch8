import { BaseInfoCard } from "../BaseInfoCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function InfoAgentDetailCard({ card }: CardComponentProps<"info_agent_detail">) {
  const { agent } = card.payload;
  return (
    <BaseInfoCard title={agent.name} summary={card.summary}>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-zinc-500">id</dt>
        <dd className="font-mono text-zinc-100">{agent.id}</dd>
        <dt className="text-zinc-500">role</dt>
        <dd className="text-zinc-300">{agent.role}</dd>
        <dt className="text-zinc-500">model</dt>
        <dd className="text-zinc-300">{agent.model}</dd>
        <dt className="text-zinc-500">status</dt>
        <dd className="text-zinc-300">{agent.status}</dd>
        {agent.maxTurns != null && (
          <>
            <dt className="text-zinc-500">maxTurns</dt>
            <dd className="text-zinc-300">{agent.maxTurns}</dd>
          </>
        )}
        {agent.budgetLimitUsd != null && (
          <>
            <dt className="text-zinc-500">budget</dt>
            <dd className="text-zinc-300">
              ${(agent.budgetSpentUsd ?? 0).toFixed(2)} / ${agent.budgetLimitUsd.toFixed(2)}
            </dd>
          </>
        )}
        {agent.desiredSkills && agent.desiredSkills.length > 0 && (
          <>
            <dt className="text-zinc-500">skills</dt>
            <dd className="text-zinc-300">{agent.desiredSkills.join(", ")}</dd>
          </>
        )}
      </dl>
    </BaseInfoCard>
  );
}
