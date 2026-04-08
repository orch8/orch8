import { BaseConfirmCard } from "../BaseConfirmCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function ConfirmKillRunCard({
  card,
  extracted,
  chatId,
}: CardComponentProps<"confirm_kill_run">) {
  const { runId, agentName, taskTitle, runningSinceSec } = card.payload;
  return (
    <BaseConfirmCard
      title={`Kill run ${runId}`}
      summary={card.summary}
      extracted={extracted}
      chatId={chatId}
    >
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-zinc-500">agent</dt>
        <dd className="text-zinc-100">{agentName}</dd>
        {taskTitle && (
          <>
            <dt className="text-zinc-500">task</dt>
            <dd className="text-zinc-300">{taskTitle}</dd>
          </>
        )}
        {runningSinceSec != null && (
          <>
            <dt className="text-zinc-500">running for</dt>
            <dd className="text-zinc-300">
              {Math.floor(runningSinceSec / 60)}m {runningSinceSec % 60}s
            </dd>
          </>
        )}
      </dl>
    </BaseConfirmCard>
  );
}
