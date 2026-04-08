import { Link } from "@tanstack/react-router";
import type { ChatCard } from "@orch/shared";
import { BaseResultCard } from "../BaseResultCard.js";
import type { CardComponentProps } from "../cardTypes.js";

type ResultSuccessKind =
  | "result_create_task" | "result_update_task" | "result_delete_task"
  | "result_create_agent" | "result_update_agent"
  | "result_pause_agent" | "result_resume_agent" | "result_delete_agent"
  | "result_create_pipeline" | "result_update_pipeline"
  | "result_run_pipeline" | "result_delete_pipeline"
  | "result_kill_run" | "result_retry_run"
  | "result_set_budget"
  | "result_add_lesson" | "result_update_memory_entity";

interface ResultGenericCardProps
  extends Omit<CardComponentProps<ResultSuccessKind>, "card"> {
  card: Extract<ChatCard, { kind: ResultSuccessKind }>;
}

/**
 * One component handles all result_<verb>_<entity> success kinds. The
 * payload schema is identical (`ResultEntityPayloadSchema`); the only
 * variation is the title text and the deep-link route, both derived
 * from `kind` and `entityKind`.
 */
export function ResultGenericCard({
  card,
  projectId,
}: ResultGenericCardProps) {
  const payload = card.payload;
  const entityId = payload.entityId;
  const entityKind = payload.entityKind ?? deriveEntityKind(card.kind);

  return (
    <BaseResultCard variant="success" title={card.summary}>
      {entityId && entityKind && (
        <p className="text-xs text-zinc-300">
          {entityKind}: <DeepLink kind={entityKind} id={entityId} projectId={projectId} />
        </p>
      )}
      {payload.fieldsChanged && payload.fieldsChanged.length > 0 && (
        <p className="mt-1 text-[10px] text-zinc-500">
          Changed: {payload.fieldsChanged.join(", ")}
        </p>
      )}
      {payload.message && (
        <p className="mt-1 text-xs text-zinc-300">{payload.message}</p>
      )}
    </BaseResultCard>
  );
}

function deriveEntityKind(kind: string): string | null {
  // result_<verb>_<entity> → <entity>
  const parts = kind.split("_");
  if (parts.length < 3) return null;
  return parts.slice(2).join("_");
}

function DeepLink({
  kind,
  id,
  projectId,
}: {
  kind: string;
  id: string;
  projectId: string;
}) {
  switch (kind) {
    case "task":
      return (
        <Link
          to="/projects/$projectId/tasks/$taskId"
          params={{ projectId, taskId: id }}
          className="font-mono text-sky-400 hover:text-sky-300"
        >
          {id}
        </Link>
      );
    case "agent":
      return (
        <Link
          to="/projects/$projectId/agents/$agentId"
          params={{ projectId, agentId: id }}
          className="font-mono text-sky-400 hover:text-sky-300"
        >
          {id}
        </Link>
      );
    case "pipeline":
      // No pipeline detail route exists yet — render as plain span.
      return <span className="font-mono text-sky-400">{id}</span>;
    case "run":
      return <span className="font-mono text-zinc-300">{id}</span>;
    default:
      return <span className="font-mono text-zinc-300">{id}</span>;
  }
}
