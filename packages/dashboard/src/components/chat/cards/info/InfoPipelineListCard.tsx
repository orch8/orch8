import { BaseInfoCard } from "../BaseInfoCard.js";
import type { CardComponentProps } from "../cardTypes.js";

// Note: Plan 05 specified a Link to `/projects/$projectId/pipelines/$pipelineId`,
// but no pipeline-detail route exists in the dashboard yet. Render the id as
// plain text for now, matching the `InfoRunListCard` pattern — we can swap this
// for a Link once a pipeline detail route is added.
export function InfoPipelineListCard({
  card,
}: CardComponentProps<"info_pipeline_list">) {
  const { pipelines } = card.payload;
  return (
    <BaseInfoCard title={`${pipelines.length} pipelines`} summary={card.summary}>
      <ul className="space-y-1 text-xs">
        {pipelines.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <span className="font-mono text-sky-400">{p.id}</span>
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
