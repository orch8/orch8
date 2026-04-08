import { Link } from "@tanstack/react-router";
import { BaseInfoCard } from "../BaseInfoCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function InfoTaskListCard({
  card,
  projectId,
}: CardComponentProps<"info_task_list">) {
  const { tasks, groupedBy } = card.payload;
  return (
    <BaseInfoCard title={`${tasks.length} tasks`} summary={card.summary}>
      {groupedBy && (
        <p className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">
          Grouped by {groupedBy}
        </p>
      )}
      <ul className="space-y-1 text-xs">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-2">
            <Link
              to="/projects/$projectId/tasks/$taskId"
              params={{ projectId, taskId: t.id }}
              className="font-mono text-sky-400 hover:text-sky-300"
            >
              {t.id}
            </Link>
            <span className="truncate text-zinc-200">{t.title}</span>
            <span className="ml-auto rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
              {t.column}
            </span>
            {t.priority && (
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                {t.priority}
              </span>
            )}
          </li>
        ))}
      </ul>
    </BaseInfoCard>
  );
}
