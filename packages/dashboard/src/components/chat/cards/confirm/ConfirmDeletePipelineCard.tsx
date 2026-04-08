import { BaseConfirmCard } from "../BaseConfirmCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function ConfirmDeletePipelineCard({
  card,
  extracted,
  chatId,
}: CardComponentProps<"confirm_delete_pipeline">) {
  const { pipelineId, name } = card.payload;
  return (
    <BaseConfirmCard
      title={`Delete "${name}"`}
      summary={card.summary}
      extracted={extracted}
      chatId={chatId}
    >
      <p className="text-xs text-red-300">
        Permanently delete pipeline <span className="font-mono">{pipelineId}</span>?
      </p>
    </BaseConfirmCard>
  );
}
