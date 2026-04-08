import { BaseConfirmCard } from "../BaseConfirmCard.js";
import { DiffTable } from "../DiffTable.js";
import type { CardComponentProps } from "../cardTypes.js";

export function ConfirmSetBudgetCard({
  card,
  extracted,
  chatId,
}: CardComponentProps<"confirm_set_budget">) {
  const { scope, entityId, current, proposed } = card.payload;
  return (
    <BaseConfirmCard
      title={`Set ${scope} budget`}
      summary={card.summary}
      extracted={extracted}
      chatId={chatId}
    >
      <p className="mb-2 text-xs text-zinc-400">
        Entity: <span className="font-mono">{entityId}</span>
      </p>
      <DiffTable
        current={current as Record<string, unknown>}
        proposed={proposed as Record<string, unknown>}
      />
    </BaseConfirmCard>
  );
}
