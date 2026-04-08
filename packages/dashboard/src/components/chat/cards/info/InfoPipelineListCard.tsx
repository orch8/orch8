import { Link } from "@tanstack/react-router";
import { BaseInfoCard } from "../BaseInfoCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function InfoPipelineListCard({
  card,
  projectId,
}: CardComponentProps<"info_pipeline_list">) {
  const { pipelines } = card.payload;
  return (
    <BaseInfoCard title={`${pipelines.length} pipelines`} summary={card.summary}>
      <ul className="space-y-1 text-xs">
        {pipelines.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <Link
              to="/projects/$projectId/pipelines/$pipelineId"
              params={{ projectId, pipelineId: p.id }}
              className="font-mono text-sky-400 hover:text-sky-300"
            >
              {p.id}
            </Link>
            <span className="text-zinc-200">{p.name}</span>
            <span className="ml-auto text-[10px] text-zinc-500">
              {p.stepCount} steps
            </span>
          </li>
        ))}
      </ul>
    </BaseInfoCard>
  );
}
