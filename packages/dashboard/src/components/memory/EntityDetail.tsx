import { useEntity, useEntityFacts } from "../../hooks/useMemory.js";

const CATEGORY_COLORS: Record<string, string> = {
  decision: "bg-blue-900/50 text-blue-300",
  status: "bg-emerald-900/50 text-emerald-300",
  milestone: "bg-purple-900/50 text-purple-300",
  issue: "bg-red-900/50 text-red-300",
  relationship: "bg-cyan-900/50 text-cyan-300",
  convention: "bg-amber-900/50 text-amber-300",
  observation: "bg-zinc-800 text-zinc-400",
};

interface EntityDetailProps {
  entityId: string;
}

export function EntityDetail({ entityId }: EntityDetailProps) {
  const { data: entity } = useEntity(entityId);
  const { data: facts, isLoading } = useEntityFacts(entityId);

  if (!entity) return null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold text-zinc-100">
          {entity.name}
        </h3>
        {entity.description && (
          <p className="mt-1 text-sm text-zinc-400">{entity.description}</p>
        )}
        <span className="mt-2 inline-block rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">
          {entity.entityType}
        </span>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Facts ({facts?.length ?? 0})
        </h4>
        {isLoading && (
          <p className="text-xs text-zinc-600">Loading facts...</p>
        )}
        <div className="space-y-2">
          {facts?.map((fact) => (
            <div
              key={fact.id}
              className="rounded border border-zinc-800 bg-zinc-900/50 p-3"
            >
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-xs ${CATEGORY_COLORS[fact.category] ?? "bg-zinc-800 text-zinc-400"}`}
                >
                  {fact.category}
                </span>
                {fact.sourceAgent && (
                  <span className="text-xs text-zinc-600">
                    by {fact.sourceAgent}
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm text-zinc-300">
                {fact.content}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
