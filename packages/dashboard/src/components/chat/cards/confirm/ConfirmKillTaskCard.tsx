import { BaseConfirmCard } from "../BaseConfirmCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function ConfirmKillTaskCard({
  card,
  extracted,
  chatId,
}: CardComponentProps<"confirm_kill_task">) {
  const { taskId, currentRunId } = card.payload;
  return (
    <BaseConfirmCard
      title={`Kill task ${taskId}`}
      summary={card.summary}
      extracted={extracted}
      chatId={chatId}
    >
      <p className="text-xs text-zinc-300">
        Stops the in-flight execution.
        {currentRunId && (
          <>
            {" "}Active run: <span className="font-mono text-zinc-100">{currentRunId}</span>.
          </>
        )}
      </p>
    </BaseConfirmCard>
  );
}
