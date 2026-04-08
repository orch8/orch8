import { BaseConfirmCard } from "../BaseConfirmCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function ConfirmDeleteTaskCard({
  card,
  extracted,
  chatId,
}: CardComponentProps<"confirm_delete_task">) {
  const { taskId, title } = card.payload;
  return (
    <BaseConfirmCard
      title={`Delete task ${taskId}`}
      summary={card.summary}
      extracted={extracted}
      chatId={chatId}
    >
      <p className="text-xs text-red-300">
        Permanently delete <span className="font-semibold">{title}</span>?
      </p>
    </BaseConfirmCard>
  );
}
