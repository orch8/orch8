import { createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { usePipelines } from "../../../../hooks/usePipelines.js";
import { PipelineList } from "../../../../components/pipeline/PipelineList.js";
import { FeatureIntake } from "../../../../components/pipeline/FeatureIntake.js";
import { RepositoryChanges } from "../../../../components/pipeline/RepositoryChanges.js";
import { TestInstructions } from "../../../../components/pipeline/TestInstructions.js";
import { useProject } from "../../../../hooks/useProjects.js";

// Pipelines tabs are built from runtime paths like
// `/projects/${projectId}/pipelines/history`, which TanStack Router's Link
// cannot verify against the generated route-tree literal at compile time.
// Widen to the prop type rather than `any` so inference still applies elsewhere.
type LinkTo = ComponentProps<typeof Link>["to"];

type Tab = "active" | "history" | "templates";

function PipelinesActivePage() {
  const { projectSlug: projectId } = Route.useParams();
  const { data: allPipelines, isLoading, isError } = usePipelines(projectId);
  const { data: project, isError: projectError } = useProject(projectId);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const activePipelines = allPipelines?.filter(
    (p) => p.status === "pending" || p.status === "running" || p.status === "failed",
  ) ?? [];
  const completedPipelines = allPipelines?.filter((p) => p.status === "completed")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()) ?? [];

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
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/projects/$projectSlug/board" params={{ projectSlug: projectId }} className="rounded border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:text-white">Open task board</Link>
        </div>
      </div>
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

      {(isLoading || isError || activePipelines.length > 0) && <section id="active-feature-workflows" aria-label="Continue feature work" className="scroll-mt-6 space-y-3 rounded-lg border border-blue-900/60 bg-blue-950/20 p-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">Continue feature work</h2>
          <p className="mt-1 text-sm text-zinc-400">Open a workflow to inspect its plan, agent runs and next decision before starting another feature in this checkout.</p>
        </div>
        {isLoading ? <p className="text-sm text-zinc-400">Loading workflows...</p> : isError ? <p role="alert" className="text-sm text-amber-300">Could not load existing workflows. Refresh before starting another feature in this checkout.</p> : <PipelineList pipelines={activePipelines} showActions />}
      </section>}
      {completedPipelines.length > 0 && <section aria-label="Completed work" className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
        <h2 className="text-base font-semibold text-zinc-100">Completed work: inspect PR status</h2>
        <p className="text-sm text-zinc-400">A completed review does not publish a PR. Open the workflow to inspect the run log and PR status. Its diff reflects the current checkout; verify the reviewed branch before publishing.</p>
        <ul className="space-y-2 text-sm">{completedPipelines.map(pipeline => <li key={pipeline.id}>
          <Link to="/projects/$projectSlug/pipelines/$pipelineId" params={{ projectSlug: projectId, pipelineId: pipeline.id }} className="text-blue-300 underline">Inspect {pipeline.name}</Link>
        </li>)}</ul>
      </section>}
      {project && <FeatureIntake key={project.id} projectId={project.id} legacySlug={project.slug} activeWorkflow={isLoading || isError || activePipelines.length > 0} onCreated={id => void navigate({ to: "/projects/$projectSlug/pipelines/$pipelineId", params: { projectSlug: projectId, pipelineId: id } })} />}
      {projectError && <p role="alert" className="text-sm text-amber-300">Could not load this repository. Refresh before planning a feature.</p>}
      {project && <TestInstructions key={`repository-tests-${project.id}`} projectId={project.id} />}
      <RepositoryChanges projectId={project?.id} projectError={projectError} />
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectSlug/pipelines/")({
  component: PipelinesActivePage,
});
