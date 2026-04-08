import { BaseConfirmCard } from "../BaseConfirmCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function ConfirmRetryRunCard({
  card,
  extracted,
  chatId,
}: CardComponentProps<"confirm_retry_run">) {
  const { runId, agentName, failureReason } = card.payload;
  return (
    <BaseConfirmCard
      title={`Retry run ${runId}`}
      summary={card.summary}
      extracted={extracted}
      chatId={chatId}
    >
      <p className="text-xs text-zinc-300">
        Re-run <span className="font-mono">{runId}</span> for agent {agentName}.
      </p>
      {failureReason && (
        <p className="mt-1 text-xs text-zinc-500">Previous failure: {failureReason}</p>
      )}
    </BaseConfirmCard>
  );
}
