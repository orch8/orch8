import { BaseConfirmCard } from "../BaseConfirmCard.js";
import { DiffTable } from "../DiffTable.js";
import type { CardComponentProps } from "../cardTypes.js";

export function ConfirmUpdateTaskCard({
  card,
  extracted,
  chatId,
  projectId,
}: CardComponentProps<"confirm_update_task">) {
  const { taskId, current, proposed } = card.payload;
  return (
    <BaseConfirmCard
      title={`Update task ${taskId}`}
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
