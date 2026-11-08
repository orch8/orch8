import { createFileRoute, Link } from "@tanstack/react-router";
import { useProjects } from "../hooks/useProjects.js";
import { usePipeline, usePipelines } from "../hooks/usePipelines.js";
import type { Pipeline, Project } from "../types.js";

function UnfinishedWorkflow({ project, pipeline }: { project: Project; pipeline: Pipeline }) {
  const { data: detail, isError: detailError } = usePipeline(pipeline.id, true);
  const step = detail?.steps.find(item => item.status === "awaiting_verification")
    ?? detail?.steps.find(item => item.status === "running")
    ?? detail?.steps.find(item => item.status === "pending")
    ?? detail?.steps.find(item => item.status === "failed");
  const action = detailError ? "Current step unavailable. Open the workflow to check its status."
    : step?.status === "awaiting_verification" ? `Your decision needed: review ${step.label.toLowerCase()}`
    : pipeline.status === "failed" ? `Workflow failed${step ? ` at ${step.label.toLowerCase()}` : ""}: inspect the run`
      : step ? `${step.label}: ${step.status}` : "Open unfinished workflow";
  return <li className="border-t border-zinc-700 pt-3 text-sm">
    <p className={detailError || step?.status === "awaiting_verification" || pipeline.status === "failed" ? "text-amber-300" : "text-zinc-300"}>{action}</p>
    <Link to="/projects/$projectSlug/pipelines/$pipelineId" params={{ projectSlug: project.slug, pipelineId: pipeline.id }} className="mt-1 inline-block text-blue-300 underline">Continue {pipeline.name}</Link>
  </li>;
}

function RepositoryCard({ project }: { project: Project }) {
  const { data: pipelines, isError } = usePipelines(project.id);
  const unfinished = pipelines?.filter(pipeline => ["pending", "running", "failed"].includes(pipeline.status))
    .sort((a, b) => {
      const aActive = a.status === "failed" ? 1 : 0;
      const bActive = b.status === "failed" ? 1 : 0;
      return aActive - bActive || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  const completed = pipelines?.filter(pipeline => pipeline.status === "completed")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return <li className="rounded border border-zinc-700 bg-zinc-900 p-4">
    <Link to="/projects/$projectSlug/pipelines" params={{ projectSlug: project.slug }} className="block hover:text-blue-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
      <span className="block font-medium text-zinc-100">{project.name}</span>
      <span className="mt-1 block break-all font-mono text-xs text-zinc-400">{project.homeDir}</span>
      <span className="mt-2 block text-xs text-blue-300">Open feature workflows →</span>
    </Link>
    {!!unfinished?.length && <ul className="mt-3 space-y-3" aria-label={`Unfinished workflows for ${project.name}`}>
      {unfinished.map(pipeline => <UnfinishedWorkflow key={pipeline.id} project={project} pipeline={pipeline} />)}
    </ul>}
    {!!completed?.length && <div className="mt-3 border-t border-zinc-700 pt-3 text-sm">
      <p className="text-zinc-300">Completed work: inspect PR status</p>
      <p className="mt-1 text-xs text-zinc-400">A completed workflow may or may not have a PR. Its diff reflects the current checkout; verify the branch before publishing.</p>
      <ul className="mt-2 space-y-2" aria-label={`Completed workflows for ${project.name}`}>
        {completed.map(pipeline => <li key={pipeline.id}>
          <Link to="/projects/$projectSlug/pipelines/$pipelineId" params={{ projectSlug: project.slug, pipelineId: pipeline.id }} className="text-blue-300 underline">Inspect {pipeline.name}</Link>
        </li>)}
      </ul>
    </div>}
    {isError && <p role="status" className="mt-3 text-xs text-amber-300">Workflow status unavailable. Open the repository to check it.</p>}
  </li>;
}

function RepositoryChooser() {
  const { data: projects, isLoading, isError, refetch } = useProjects();
  const active = projects?.filter(project => project.active) ?? [];

  return <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Open a repository</h1>
        <p className="mt-2 text-sm text-zinc-400">Choose a checkout to build a feature, add a local Git repository, or clone one from GitHub.</p>
      </div>
      <Link to="/projects/new" className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">Add repository</Link>
    </div>
    {isLoading && <p role="status" className="text-zinc-400">Loading repositories...</p>}
    {isError && <div role="alert" className="rounded border border-amber-700 p-4 text-amber-200">Could not load repositories. <button type="button" onClick={() => void refetch()} className="underline">Retry</button></div>}
    {!isLoading && !isError && active.length === 0 && <p className="rounded border border-zinc-700 p-5 text-zinc-300">No active repositories yet. Add a local checkout to start a feature.</p>}
    {active.length > 0 && <ul className="space-y-3" aria-label="Available repositories">
      {active.map(project => <RepositoryCard key={project.id} project={project} />)}
    </ul>}
  </div>;
}

export const Route = createFileRoute("/")({ component: RepositoryChooser });
