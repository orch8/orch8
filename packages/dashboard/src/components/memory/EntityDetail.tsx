import { useState } from "react";
import { useEntity, useEntityFacts, useCreateFact } from "../../hooks/useMemory.js";
import { useSupersedeFact, useRegenerateSummary } from "../../hooks/useMemoryMutations.js";
import { MarkdownRenderer } from "../shared/MarkdownRenderer.js";
import { FormField } from "../shared/FormField.js";

const CATEGORY_COLORS: Record<string, string> = {
  decision: "bg-blue-900/50 text-blue-300",
  status: "bg-emerald-900/50 text-emerald-300",
  milestone: "bg-purple-900/50 text-purple-300",
  issue: "bg-red-900/50 text-red-300",
  relationship: "bg-cyan-900/50 text-cyan-300",
  convention: "bg-amber-900/50 text-amber-300",
  observation: "bg-zinc-800 text-zinc-400",
};

const CATEGORIES = ["decision", "status", "milestone", "issue", "relationship", "convention", "observation"];

interface EntityDetailProps {
  entityId: string;
}

export function EntityDetail({ entityId }: EntityDetailProps) {
  const { data: entity } = useEntity(entityId);
  const { data: facts, isLoading } = useEntityFacts(entityId);
  const supersedeFact = useSupersedeFact();
  const regenerateSummary = useRegenerateSummary();
  const createFact = useCreateFact();

  const [supersedeTarget, setSupersedeTarget] = useState<string | null>(null);
  const [supersedeContent, setSupersedeContent] = useState("");
  const [showAddFact, setShowAddFact] = useState(false);
  const [newFactBody, setNewFactBody] = useState("");
  const [newFactCategory, setNewFactCategory] = useState("observation");

  if (!entity) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-zinc-100">{entity.name}</h3>
          {entity.description && (
            <p className="mt-1 text-sm text-zinc-400">{entity.description}</p>
          )}
          <span className="mt-2 inline-block rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">
            {entity.entityType}
          </span>
        </div>
        <button
          onClick={() => regenerateSummary.mutate(entityId)}
          disabled={regenerateSummary.isPending}
          className="rounded bg-zinc-700 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-600 disabled:opacity-40"
        >
          {regenerateSummary.isPending ? "Regenerating..." : "Regenerate Summary"}
        </button>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Facts ({facts?.length ?? 0})
        </h4>
        {isLoading && <p className="text-xs text-zinc-600">Loading facts...</p>}
        <div className="space-y-2">
          {facts?.map((fact) => (
            <div key={fact.id} className="rounded border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${CATEGORY_COLORS[fact.category] ?? "bg-zinc-800 text-zinc-400"}`}>
                    {fact.category}
                  </span>
                  {fact.sourceAgent && (
                    <span className="text-xs text-zinc-600">by {fact.sourceAgent}</span>
                  )}
                </div>
                <button
                  onClick={() => { setSupersedeTarget(fact.id); setSupersedeContent(""); }}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Supersede
                </button>
              </div>
              <MarkdownRenderer content={fact.content} />

              {supersedeTarget === fact.id && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await supersedeFact.mutateAsync({
                      entityId,
                      factId: fact.id,
                      newContent: supersedeContent,
                      category: fact.category,
                    });
                    setSupersedeTarget(null);
                  }}
                  className="mt-2 flex flex-col gap-2"
                >
                  <textarea
                    value={supersedeContent}
                    onChange={(e) => setSupersedeContent(e.target.value)}
                    placeholder="Replacement fact content..."
                    className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 placeholder-zinc-600"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={!supersedeContent.trim() || supersedeFact.isPending}
                      className="rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:opacity-40"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={() => setSupersedeTarget(null)}
                      className="text-xs text-zinc-500"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Add Fact */}
      <div>
        <button
          onClick={() => setShowAddFact(!showAddFact)}
          className="rounded bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-600"
        >
          + Add Fact
        </button>
        {showAddFact && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await createFact.mutateAsync({
                entityId,
                content: newFactBody,
                category: newFactCategory,
              });
              setNewFactBody("");
              setShowAddFact(false);
            }}
            className="mt-2 flex flex-col gap-2 rounded border border-zinc-800 bg-zinc-900/50 p-3"
          >
            <FormField label="Category">
              <select
                value={newFactCategory}
                onChange={(e) => setNewFactCategory(e.target.value)}
                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Content">
              <textarea
                value={newFactBody}
                onChange={(e) => setNewFactBody(e.target.value)}
                required
                rows={3}
                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
              />
            </FormField>
            <button
              type="submit"
              disabled={!newFactBody.trim() || createFact.isPending}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
            >
              Add
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
