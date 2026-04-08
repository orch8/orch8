import { BaseConfirmCard } from "../BaseConfirmCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function ConfirmDeleteAgentCard({
  card,
  extracted,
  chatId,
  projectId,
}: CardComponentProps<"confirm_delete_agent">) {
  const { agentId, name } = card.payload;
  return (
    <BaseConfirmCard
      title={`Delete ${name}`}
      summary={card.summary}
      extracted={extracted}
      chatId={chatId}
      projectId={projectId}
    >
      <p className="text-xs text-red-300">
        Permanently delete agent <span className="font-mono">{agentId}</span>? This cannot be undone.
      </p>
    </BaseConfirmCard>
  );
}
