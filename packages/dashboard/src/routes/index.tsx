import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client.js";
import { useProjects } from "../hooks/useProjects.js";
import { usePipeline, usePipelines } from "../hooks/usePipelines.js";
import type { Pipeline, Project } from "../types.js";

function UnfinishedWorkflow({ project, pipeline }: { project: Project; pipeline: Pipeline }) {
  const { data: detail, isError: detailError } = usePipeline(pipeline.id, true);
  const step = (pipeline.status === "failed" ? detail?.steps.find(item => item.status === "failed") : undefined)
    ?? detail?.steps.find(item => item.status === "awaiting_verification")
    ?? detail?.steps.find(item => item.status === "running")
    ?? detail?.steps.find(item => item.status === "pending")
    ?? detail?.steps.find(item => item.status === "failed");
  const action = detailError ? "Current step unavailable. Open the workflow to check its status."
    : step?.status === "awaiting_verification" ? `Your decision needed: review ${step.label.toLowerCase()}`
    : pipeline.status === "failed" ? `Workflow failed${step ? ` at ${step.label.toLowerCase()}` : ""}: inspect the run`
      : step ? `${step.label}: ${step.status}` : "Open unfinished workflow";
  const workflowUrl = `/projects/${encodeURIComponent(project.slug)}/pipelines/${encodeURIComponent(pipeline.id)}`;
  return <li className="border-t border-zinc-700 pt-3 text-sm">
    <p className={detailError || step?.status === "awaiting_verification" || pipeline.status === "failed" ? "text-amber-300" : "text-zinc-300"}>{action}</p>
    <Link to="/projects/$projectSlug/pipelines/$pipelineId" params={{ projectSlug: project.slug, pipelineId: pipeline.id }} className="mt-1 inline-block text-blue-300 underline">Continue {pipeline.name}</Link>
    {step?.id && (step.status === "awaiting_verification" || step.status === "failed") &&
      <a href={`${workflowUrl}#workflow-step-${encodeURIComponent(step.id)}`} className="ml-3 inline-block rounded border border-amber-700 px-2 py-1 text-amber-200 hover:bg-amber-950/50">
        {step.status === "awaiting_verification" ? `Review ${step.label.toLowerCase()} now` : `Inspect failed ${step.label.toLowerCase()}`}
      </a>}
  </li>;
}

function RepositoryCard({ project }: { project: Project }) {
  const draftKey = `orch8:feature-draft:${project.slug}`;
  const [request, setRequest] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) ?? "null");
      return typeof saved?.feature === "string" ? saved.feature : "";
    } catch { return ""; }
  });
  const [draftError, setDraftError] = useState(false);
  function saveRequest(nextRequest: string) {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) ?? "null");
      const previous = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
      const changed = previous.feature !== nextRequest;
      localStorage.setItem(draftKey, JSON.stringify({ ...previous, feature: nextRequest, ...(changed ? { branchName: "", filePaths: [] } : {}) }));
      setDraftError(false);
      return true;
    } catch { setDraftError(true); return false; }
  }
  const { data: pipelines, isError } = usePipelines(project.id);
  const { data: checkout, isError: checkoutError, isFetching: checkingCheckout, refetch: refreshCheckout } = useQuery({
    queryKey: ["feature-branch", project.id],
    queryFn: () => api.get<{ ready: boolean; branch: string; baseBranch: string; reason?: string }>(
      `/projects/${encodeURIComponent(project.id)}/feature-branch`,
    ),
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    retry: false,
  });
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
      {checkout && !checkoutError && !checkingCheckout && <span className={`mt-2 block text-xs ${checkout.ready ? "text-emerald-300" : "text-amber-300"}`}>
        {checkout.ready ? `Checkout clean on base · ${checkout.branch}` :
          checkout.branch && checkout.branch !== checkout.baseBranch
            ? `On ${checkout.branch} · ${checkout.reason ?? "Finish or inspect existing work before starting another feature."}`
            : `Not ready for a new feature · ${checkout.reason ?? "Inspect the checkout."}`}
      </span>}
      {checkingCheckout && <span className="mt-2 block text-xs text-zinc-400">Checking checkout...</span>}
      {checkoutError && <span className="mt-2 block text-xs text-amber-300">Checkout status unavailable. Inspect the repository before starting.</span>}
      <span className="mt-2 block text-xs text-blue-300">Open feature workflows →</span>
    </Link>
    <button type="button" onClick={() => void refreshCheckout()} className="mt-2 text-xs text-blue-300 underline">Refresh checkout status</button>
    <details className="mt-3 border-t border-zinc-700 pt-3 text-sm text-zinc-300">
      <summary className="cursor-pointer text-blue-300">Describe a feature</summary>
      <label htmlFor={`quick-feature-${project.id}`} className="mt-3 block">What should change in {project.name}?</label>
      <textarea id={`quick-feature-${project.id}`} value={request} maxLength={2000} rows={3} onChange={event => { setRequest(event.target.value); saveRequest(event.target.value); }} placeholder="Describe the result you want" className="mt-2 w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-zinc-100" />
      <p className="mt-1 text-xs text-zinc-400">Saves a browser draft and opens plan setup. Check the runtime before starting the planning agent; implementation waits for your plan approval.</p>
      {request.trim() && <Link to="/projects/$projectSlug/pipelines" params={{ projectSlug: project.slug }} hash="new-feature" onClick={event => { if (!saveRequest(request)) event.preventDefault(); }} className="mt-2 inline-block rounded border border-blue-500 px-3 py-2 text-blue-200">Continue to plan setup</Link>}
      {draftError && <p role="alert" className="mt-2 text-amber-300">Browser storage is unavailable. Copy your request into the feature form after opening the repository.</p>}
    </details>
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
