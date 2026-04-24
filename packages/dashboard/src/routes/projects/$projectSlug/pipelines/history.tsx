import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { usePipelines } from "../../../../hooks/usePipelines.js";
import { PipelineList } from "../../../../components/pipeline/PipelineList.js";

// See pipelines/index.tsx for rationale.
type LinkTo = ComponentProps<typeof Link>["to"];

type Tab = "active" | "history" | "templates";

function PipelinesHistoryPage() {
  const { projectSlug: projectId } = Route.useParams();
  const { data: allPipelines, isLoading } = usePipelines(projectId);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const historyPipelines = (allPipelines ?? [])
    .filter((p) => p.status === "completed" || p.status === "cancelled")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

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
            to={tab.to as LinkTo}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              pathname === tab.to || (tab.key === "history" && pathname.endsWith("/history"))
                ? "border-b-2 border-blue-500 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-zinc-600">Loading...</p>
      ) : (
        <PipelineList pipelines={historyPipelines} />
      )}
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectSlug/pipelines/history")({
  component: PipelinesHistoryPage,
});
