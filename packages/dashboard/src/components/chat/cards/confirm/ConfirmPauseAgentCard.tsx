import { BaseConfirmCard } from "../BaseConfirmCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function ConfirmPauseAgentCard({
  card,
  extracted,
  chatId,
}: CardComponentProps<"confirm_pause_agent">) {
  const { agentId, name, reason } = card.payload;
  return (
    <BaseConfirmCard
      title={`Pause ${name}`}
      summary={card.summary}
      extracted={extracted}
      chatId={chatId}
    >
      <p className="text-xs text-zinc-300">
        Pauses agent <span className="font-mono">{agentId}</span>. The agent stops running but
        keeps its state and can be resumed later.
        {reason && <> Reason: {reason}.</>}
      </p>
    </BaseConfirmCard>
  );
}
