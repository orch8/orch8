import { BaseConfirmCard } from "../BaseConfirmCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function ConfirmAssignTaskCard({
  card,
  extracted,
  chatId,
}: CardComponentProps<"confirm_assign_task">) {
  const { taskId, currentAssignee, proposedAssignee } = card.payload;
  return (
    <BaseConfirmCard
      title={`Assign task ${taskId}`}
      summary={card.summary}
      extracted={extracted}
      chatId={chatId}
    >
      <p className="text-xs">
        <span className="text-zinc-500">{currentAssignee ?? "(unassigned)"}</span>
        <span className="mx-2">→</span>
        <span className="text-emerald-300">{proposedAssignee}</span>
      </p>
    </BaseConfirmCard>
  );
}
