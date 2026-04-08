import { BaseConfirmCard } from "../BaseConfirmCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function ConfirmCreateTaskCard({
  card,
  extracted,
  chatId,
  projectId,
}: CardComponentProps<"confirm_create_task">) {
  const p = card.payload;
  return (
    <BaseConfirmCard
      title="Create task"
      summary={card.summary}
      extracted={extracted}
      chatId={chatId}
      projectId={projectId}
    >
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-zinc-500">title</dt>
        <dd className="text-zinc-100">{p.title}</dd>
        {p.description && (
          <>
            <dt className="text-zinc-500">description</dt>
            <dd className="text-zinc-300">{p.description}</dd>
          </>
        )}
        {p.column && (
          <>
            <dt className="text-zinc-500">column</dt>
            <dd className="text-zinc-300">{p.column}</dd>
          </>
        )}
        {p.taskType && (
          <>
            <dt className="text-zinc-500">type</dt>
            <dd className="text-zinc-300">{p.taskType}</dd>
          </>
        )}
        {p.priority && (
          <>
            <dt className="text-zinc-500">priority</dt>
            <dd className="text-zinc-300">{p.priority}</dd>
          </>
        )}
        {p.assignee && (
          <>
            <dt className="text-zinc-500">assignee</dt>
            <dd className="text-zinc-300">{p.assignee}</dd>
          </>
        )}
      </dl>
    </BaseConfirmCard>
  );
}
