import { Link } from "@tanstack/react-router";
import { BaseInfoCard } from "../BaseInfoCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function InfoAgentListCard({
  card,
  projectId,
}: CardComponentProps<"info_agent_list">) {
  const { agents } = card.payload;
  return (
    <BaseInfoCard title={`${agents.length} agents`} summary={card.summary}>
      <ul className="space-y-1 text-xs">
        {agents.map((a) => (
          <li key={a.id} className="flex items-center gap-2">
            <Link
              to="/projects/$projectId/agents/$agentId"
              params={{ projectId, agentId: a.id }}
              className="font-mono text-sky-400 hover:text-sky-300"
            >
              {a.id}
            </Link>
            <span className="text-zinc-200">{a.name}</span>
            <span className="ml-auto rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
              {a.model}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                a.status === "active"
                  ? "bg-emerald-900/40 text-emerald-300"
                  : "bg-zinc-800 text-zinc-500"
              }`}
            >
              {a.status}
            </span>
          </li>
        ))}
      </ul>
    </BaseInfoCard>
  );
}
