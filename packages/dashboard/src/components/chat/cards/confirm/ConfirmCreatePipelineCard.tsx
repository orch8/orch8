import { BaseConfirmCard } from "../BaseConfirmCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function ConfirmCreatePipelineCard({
  card,
  extracted,
  chatId,
  projectId,
}: CardComponentProps<"confirm_create_pipeline">) {
  const p = card.payload;
  return (
    <BaseConfirmCard
      title={`Create pipeline "${p.name}"`}
      summary={card.summary}
      extracted={extracted}
      chatId={chatId}
      projectId={projectId}
    >
      {p.templateId && (
        <p className="text-xs text-zinc-400">
          From template <span className="font-mono">{p.templateId}</span>
        </p>
      )}
      {p.steps && p.steps.length > 0 && (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-zinc-300">
          {p.steps.map((s) => (
            <li key={s.order}>
              <span className="font-medium">{s.label}</span>
              {s.defaultAgentId && (
                <span className="ml-2 text-zinc-500">
                  → {s.defaultAgentId}
                </span>
              )}
              {s.requiresVerification && (
                <span className="ml-2 rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] text-amber-200">
                  verify
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </BaseConfirmCard>
  );
}
