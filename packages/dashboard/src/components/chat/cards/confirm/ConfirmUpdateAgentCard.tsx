import { BaseConfirmCard } from "../BaseConfirmCard.js";
import { DiffTable } from "../DiffTable.js";
import type { CardComponentProps } from "../cardTypes.js";

export function ConfirmUpdateAgentCard({
  card,
  extracted,
  chatId,
}: CardComponentProps<"confirm_update_agent">) {
  const { agentId, current, proposed } = card.payload;
  return (
    <BaseConfirmCard
      title={`Update agent ${agentId}`}
      summary={card.summary}
      extracted={extracted}
      chatId={chatId}
    >
      <DiffTable
        current={current as Record<string, unknown>}
        proposed={proposed as Record<string, unknown>}
      />
    </BaseConfirmCard>
  );
}
