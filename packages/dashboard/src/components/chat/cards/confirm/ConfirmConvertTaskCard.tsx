import { BaseConfirmCard } from "../BaseConfirmCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function ConfirmConvertTaskCard({
  card,
  extracted,
  chatId,
  projectId,
}: CardComponentProps<"confirm_convert_task">) {
  const { taskId, from, to } = card.payload;
  return (
    <BaseConfirmCard
      title={`Convert task ${taskId}`}
      summary={card.summary}
      extracted={extracted}
      chatId={chatId}
      projectId={projectId}
    >
      <p className="text-xs">
        <span className="text-zinc-500">{from}</span>
        <span className="mx-2">→</span>
        <span className="text-emerald-300">{to}</span>
      </p>
    </BaseConfirmCard>
  );
}
