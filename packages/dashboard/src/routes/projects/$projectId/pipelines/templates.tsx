import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  usePipelineTemplates,
  useDeletePipelineTemplate,
} from "../../../../hooks/usePipelineTemplates.js";
import { PipelineTemplateEditor } from "../../../../components/pipeline/PipelineTemplateEditor.js";
import type { PipelineTemplate } from "../../../../types.js";

type Tab = "active" | "history" | "templates";

function PipelinesTemplatesPage() {
  const { projectId } = Route.useParams();
  const { data: templates, isLoading } = usePipelineTemplates(projectId);
  const deleteMutation = useDeletePipelineTemplate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [editing, setEditing] = useState<PipelineTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  const tabs: Array<{ key: Tab; label: string; to: string }> = [
    { key: "active", label: "Active", to: `/projects/${projectId}/pipelines` },
    { key: "history", label: "History", to: `/projects/${projectId}/pipelines/history` },
    { key: "templates", label: "Templates", to: `/projects/${projectId}/pipelines/templates` },
  ];

  return (
    <div className="flex flex-col gap-4 p-[var(--gap-section)]">
      <h1 className="type-section font-semibold text-zinc-100">Pipelines</h1>

      <div className="flex gap-1 border-b border-zinc-800">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            to={tab.to as any}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              pathname === tab.to || (tab.key === "templates" && pathname.endsWith("/templates"))
                ? "border-b-2 border-blue-500 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {creating || editing ? (
        <PipelineTemplateEditor
          projectId={projectId}
          template={editing}
          onDone={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() => setCreating(true)}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
            >
              New Template
            </button>
          </div>

          {isLoading ? (
            <p className="text-sm text-zinc-600">Loading...</p>
          ) : templates?.length === 0 ? (
            <p className="text-sm text-zinc-600">
              No templates yet. Create one to define reusable pipeline workflows.
            </p>
          ) : (
            templates?.map((tpl) => (
              <div
                key={tpl.id}
                className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900/50 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-200">
                    {tpl.name}
                    {tpl.isDefault && (
                      <span className="ml-2 rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-400">
                        default
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {(tpl.steps as Array<{ label: string }>).map((s) => s.label).join(" \u2192 ")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(tpl)}
                    className="text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(tpl.id)}
                    disabled={deleteMutation.isPending}
                    className="text-xs text-zinc-600 hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/pipelines/templates")({
  component: PipelinesTemplatesPage,
});
