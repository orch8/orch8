import { BaseConfirmCard } from "../BaseConfirmCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function ConfirmAddLessonCard({
  card,
  extracted,
  chatId,
  projectId,
}: CardComponentProps<"confirm_add_lesson">) {
  const { title, body, tags } = card.payload;
  return (
    <BaseConfirmCard
      title={`Add lesson "${title}"`}
      summary={card.summary}
      extracted={extracted}
      chatId={chatId}
      projectId={projectId}
    >
      <p className="whitespace-pre-wrap text-xs text-zinc-300">{body}</p>
      {tags && tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </BaseConfirmCard>
  );
}
