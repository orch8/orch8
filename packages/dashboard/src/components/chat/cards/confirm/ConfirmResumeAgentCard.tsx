import { BaseConfirmCard } from "../BaseConfirmCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function ConfirmResumeAgentCard({
  card,
  extracted,
  chatId,
}: CardComponentProps<"confirm_resume_agent">) {
  const { agentId, name } = card.payload;
  return (
    <BaseConfirmCard
      title={`Resume ${name}`}
      summary={card.summary}
      extracted={extracted}
      chatId={chatId}
    >
      <p className="text-xs text-zinc-300">
        Resumes agent <span className="font-mono">{agentId}</span>.
      </p>
    </BaseConfirmCard>
  );
}
