import { BaseConfirmCard } from "../BaseConfirmCard.js";
import { DiffTable } from "../DiffTable.js";
import type { CardComponentProps } from "../cardTypes.js";

export function ConfirmUpdatePipelineCard({
  card,
  extracted,
  chatId,
  projectId,
}: CardComponentProps<"confirm_update_pipeline">) {
  const { pipelineId, current, proposed } = card.payload;
  return (
    <BaseConfirmCard
      title={`Update pipeline ${pipelineId}`}
      summary={card.summary}
      extracted={extracted}
      chatId={chatId}
      projectId={projectId}
    >
      <DiffTable
        current={current as Record<string, unknown>}
        proposed={proposed as Record<string, unknown>}
      />
    </BaseConfirmCard>
  );
}
