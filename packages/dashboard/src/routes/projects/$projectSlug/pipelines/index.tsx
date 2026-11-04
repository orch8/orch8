import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useState, type ComponentProps } from "react";
import { usePipelines } from "../../../../hooks/usePipelines.js";
import { PipelineList } from "../../../../components/pipeline/PipelineList.js";
import { FeatureIntake } from "../../../../components/pipeline/FeatureIntake.js";
import { PipelineDetail } from "../../../../components/pipeline/PipelineDetail.js";

// Pipelines tabs are built from runtime paths like
// `/projects/${projectId}/pipelines/history`, which TanStack Router's Link
// cannot verify against the generated route-tree literal at compile time.
// Widen to the prop type rather than `any` so inference still applies elsewhere.
type LinkTo = ComponentProps<typeof Link>["to"];

type Tab = "active" | "history" | "templates";

function PipelinesActivePage() {
  const { projectSlug: projectId } = Route.useParams();
  const { data: allPipelines, isLoading } = usePipelines(projectId);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [created, setCreated] = useState<{ id: string; projectId: string } | null>(null);
  const createdId = created?.projectId === projectId ? created.id : null;

  const activePipelines = allPipelines?.filter(
    (p) => p.status === "pending" || p.status === "running" || p.status === "failed",
  ) ?? [];

  const tabs: Array<{ key: Tab; label: string; to: string }> = [
    { key: "active", label: "Active", to: `/projects/${projectId}/pipelines` },
    { key: "history", label: "History", to: `/projects/${projectId}/pipelines/history` },
    { key: "templates", label: "Templates", to: `/projects/${projectId}/pipelines/templates` },
  ];

  function isTabActive(to: string) {
    return pathname === to || (to.endsWith("/pipelines") && pathname === to);
  }

  return (
    <div className="flex flex-col gap-4 p-[var(--gap-section)]">
      <h1 className="type-section font-semibold text-zinc-100">Pipelines</h1>
      <FeatureIntake key={projectId} projectId={projectId} onCreated={id => setCreated({ id, projectId })} />
      {createdId && <div className="rounded border border-blue-800 bg-blue-950/20 p-4">
        <p className="mb-3 text-sm text-blue-200">Planning requested. A completed plan appears here for approval before the implementation step starts. A finished agent run alone does not mean the plan is complete.</p>
        <PipelineDetail pipelineId={createdId} projectId={projectId} />
      </div>}

      <div className="flex gap-1 border-b border-zinc-800">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            to={tab.to as LinkTo}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              isTabActive(tab.to)
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
        <PipelineList pipelines={activePipelines} showActions />
      )}
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectSlug/pipelines/")({
  component: PipelinesActivePage,
});
