import { BaseConfirmCard } from "../BaseConfirmCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function ConfirmRunPipelineCard({
  card,
  extracted,
  chatId,
}: CardComponentProps<"confirm_run_pipeline">) {
  const { pipelineId, name, inputs } = card.payload;
  return (
    <BaseConfirmCard
      title={`Run "${name}"`}
      summary={card.summary}
      extracted={extracted}
      chatId={chatId}
    >
      <p className="text-xs text-zinc-300">
        Pipeline <span className="font-mono">{pipelineId}</span>
      </p>
      {inputs && Object.keys(inputs).length > 0 && (
        <pre className="mt-2 overflow-x-auto rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-300">
          {JSON.stringify(inputs, null, 2)}
        </pre>
      )}
    </BaseConfirmCard>
  );
}
