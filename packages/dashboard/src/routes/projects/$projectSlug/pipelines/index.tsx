import { createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { usePipelines } from "../../../../hooks/usePipelines.js";
import { PipelineList } from "../../../../components/pipeline/PipelineList.js";
import { FeatureIntake } from "../../../../components/pipeline/FeatureIntake.js";
import { useProject } from "../../../../hooks/useProjects.js";

// Pipelines tabs are built from runtime paths like
// `/projects/${projectId}/pipelines/history`, which TanStack Router's Link
// cannot verify against the generated route-tree literal at compile time.
// Widen to the prop type rather than `any` so inference still applies elsewhere.
type LinkTo = ComponentProps<typeof Link>["to"];

type Tab = "active" | "history" | "templates";

function PipelinesActivePage() {
  const { projectSlug: projectId } = Route.useParams();
  const { data: allPipelines, isLoading } = usePipelines(projectId);
  const { data: project } = useProject(projectId);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="type-section font-semibold text-zinc-100">Build in {project?.name ?? "repository"}</h1>
          <p className="mt-1 break-all text-xs text-zinc-400">{project?.homeDir ?? "Loading repository..."} {project?.defaultBranch ? `· base ${project.defaultBranch}` : ""}</p>
        </div>
        <Link to="/projects/$projectSlug/board" params={{ projectSlug: projectId }} className="rounded border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:text-white">Open task board</Link>
      </div>
      <FeatureIntake key={projectId} projectId={projectId} onCreated={id => void navigate({ to: "/projects/$projectSlug/pipelines/$pipelineId", params: { projectSlug: projectId, pipelineId: id } })} />

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
