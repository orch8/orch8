import { BaseConfirmCard } from "../BaseConfirmCard.js";
import { DiffTable } from "../DiffTable.js";
import type { CardComponentProps } from "../cardTypes.js";

export function ConfirmUpdateMemoryEntityCard({
  card,
  extracted,
  chatId,
}: CardComponentProps<"confirm_update_memory_entity">) {
  const { entityId, current, proposed } = card.payload;
  return (
    <BaseConfirmCard
      title={`Update memory entity ${entityId}`}
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
