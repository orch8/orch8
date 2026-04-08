import { Link } from "@tanstack/react-router";
import { BaseInfoCard } from "../BaseInfoCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function InfoTaskDetailCard({
  card,
  projectId,
}: CardComponentProps<"info_task_detail">) {
  const { task } = card.payload;
  return (
    <BaseInfoCard title={task.title} summary={card.summary}>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-zinc-500">id</dt>
        <dd>
          <Link
            to="/projects/$projectId/tasks/$taskId"
            params={{ projectId, taskId: task.id }}
            className="font-mono text-sky-400 hover:text-sky-300"
          >
            {task.id}
          </Link>
        </dd>
        <dt className="text-zinc-500">column</dt>
        <dd className="text-zinc-300">{task.column}</dd>
        {task.priority && (
          <>
            <dt className="text-zinc-500">priority</dt>
            <dd className="text-zinc-300">{task.priority}</dd>
          </>
        )}
        {task.assignee && (
          <>
            <dt className="text-zinc-500">assignee</dt>
            <dd className="text-zinc-300">{task.assignee}</dd>
          </>
        )}
      </dl>
      {task.description && (
        <p className="mt-2 whitespace-pre-wrap text-xs text-zinc-300">
          {task.description}
        </p>
      )}
    </BaseInfoCard>
  );
}
