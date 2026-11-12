import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type MouseEvent } from "react";
import { api } from "../api/client.js";
import { useProjects } from "../hooks/useProjects.js";
import { usePipeline, usePipelines } from "../hooks/usePipelines.js";
import type { Pipeline, Project } from "../types.js";
import { SandboxRecoveryGuidance } from "../components/pipeline/SandboxRecoveryGuidance.js";
import { RepositoryChanges } from "../components/pipeline/RepositoryChanges.js";

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
    <Link to="/projects/$projectSlug/pipelines/$pipelineId" params={{ projectSlug: project.slug, pipelineId: pipeline.id }} className="mt-1 line-clamp-2 break-words text-blue-300 underline">Continue {pipeline.name}</Link>
    {step?.id && (step.status === "awaiting_verification" || step.status === "failed") &&
      <a href={`${workflowUrl}#workflow-step-${encodeURIComponent(step.id)}`} className="ml-3 inline-block rounded border border-amber-700 px-2 py-1 text-amber-200 hover:bg-amber-950/50">
        {step.status === "awaiting_verification" ? `Review ${step.label.toLowerCase()} now` : `Inspect failed ${step.label.toLowerCase()}`}
      </a>}
  </li>;
}

function RepositoryCard({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState("");
  const [checkingClaude, setCheckingClaude] = useState(false);
  const [claudeResult, setClaudeResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [checkingCodex, setCheckingCodex] = useState(false);
  const [codexResult, setCodexResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [inspectingChanges, setInspectingChanges] = useState(false);
  // FeatureIntake reads drafts by project id; the URL slug is only for navigation.
  const draftKey = `orch8:feature-draft:${project.id}`;
  const [request, setRequest] = useState(() => {
    try {
      const saved = JSON.parse((localStorage.getItem(draftKey) ?? localStorage.getItem(`orch8:feature-draft:${project.slug}`)) ?? "null");
      return typeof saved?.feature === "string" ? saved.feature : "";
    } catch { return ""; }
  });
  const [draftError, setDraftError] = useState(false);
  function saveRequest(nextRequest: string) {
    try {
      const saved = JSON.parse((localStorage.getItem(draftKey) ?? localStorage.getItem(`orch8:feature-draft:${project.slug}`)) ?? "null");
      const previous = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
      const changed = previous.feature !== nextRequest;
      localStorage.setItem(draftKey, JSON.stringify({ ...previous, feature: nextRequest, ...(changed ? { branchName: "", filePaths: [] } : {}) }));
      if (project.slug !== project.id) localStorage.removeItem(`orch8:feature-draft:${project.slug}`);
      setDraftError(false);
      return true;
    } catch { setDraftError(true); return false; }
  }
  const { data: pipelines, isError } = usePipelines(project.id);
  const { data: checkout, isError: checkoutError, isFetching: checkingCheckout, refetch: refreshCheckout } = useQuery({
    queryKey: ["feature-branch", project.id],
    queryFn: () => api.get<{ ready: boolean; branch: string; baseBranch: string; reason?: string; note?: string }>(
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
  async function returnToBase() {
    if (!checkout?.branch || checkout.branch === checkout.baseBranch || returning) return;
    setReturning(true);
    setReturnError("");
    try {
      const result = await api.post<{ ready: boolean; branch: string; baseBranch: string; reason?: string }>(
        `/projects/${encodeURIComponent(project.id)}/return-to-base`, {},
      );
      // A window-focus/readiness refetch started during the POST must not restore
      // the old branch after the server has switched the checkout.
      await queryClient.cancelQueries({ queryKey: ["feature-branch", project.id] });
      queryClient.setQueryData(["feature-branch", project.id], result);
      void queryClient.invalidateQueries({ queryKey: ["repository-changes", project.id] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not return to base";
      try { setReturnError(JSON.parse(message).message ?? message); } catch { setReturnError(message); }
    } finally { setReturning(false); }
  }
  async function checkClaude() {
    if (checkingClaude) return;
    setCheckingClaude(true);
    setClaudeResult(null);
    try {
      const result = await api.post<{ ok: boolean; message?: string }>("/adapter/claude_local/test-environment", {
        projectId: project.id, config: { dangerouslySkipPermissions: false },
      });
      setClaudeResult({ ok: result.ok, message: result.message ?? (result.ok ? "Claude can run a command in this checkout." : "Claude could not run a command in this checkout.") });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Claude runtime check failed.";
      try { setClaudeResult({ ok: false, message: JSON.parse(message).message ?? message }); }
      catch { setClaudeResult({ ok: false, message }); }
    } finally { setCheckingClaude(false); }
  }
  async function checkCodex() {
    if (checkingCodex) return;
    setCheckingCodex(true);
    setCodexResult(null);
    try {
      const result = await api.post<{ ok: boolean; message?: string }>("/adapter/codex_local/test-environment", {
        config: { sandbox: "workspace-write", dangerouslyBypassApprovalsAndSandbox: false, sandboxOnly: true },
      });
      setCodexResult({ ok: result.ok, message: result.message ?? (result.ok ? "Codex sandbox check passed." : "Codex sandbox check failed.") });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Codex runtime check failed.";
      try { setCodexResult({ ok: false, message: JSON.parse(message).message ?? message }); }
      catch { setCodexResult({ ok: false, message }); }
    } finally { setCheckingCodex(false); }
  }
  const canStartFeature = !!checkout?.ready && !checkoutError && !checkingCheckout && !isError && !!pipelines && !unfinished?.length;
  const featureEntry = <section className="border-t border-zinc-700 pt-3 text-sm text-zinc-300" aria-label={`New feature for ${project.name}`}>
      <label htmlFor={`quick-feature-${project.id}`} className="block font-medium text-zinc-200">Describe a new feature for {project.name}</label>
      <textarea id={`quick-feature-${project.id}`} value={request} maxLength={2000} rows={3} onChange={event => { setRequest(event.target.value); saveRequest(event.target.value); }} placeholder="What should change in this repository?" className="mt-2 w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-zinc-100" />
      <p className="mt-1 text-xs text-zinc-400">Your request stays in this browser. Next you will choose agents, check the runtime, and review the plan before implementation.</p>
      {checkout && !checkout.ready && !checkoutError && !checkingCheckout ? <div role="status" className="mt-2 space-y-2 rounded border border-amber-700/60 bg-amber-950/20 p-3 text-xs text-amber-200">
        <p>New feature setup is paused while this checkout is not ready. {draftError ? "Copy your request before leaving this page." : "Your request is saved here."}</p>
        {unfinished?.[0] ? <Link to="/projects/$projectSlug/pipelines/$pipelineId" params={{ projectSlug: project.slug, pipelineId: unfinished[0].id }} className="inline-block underline">Resume unfinished workflow</Link>
          : <p>Inspect the checkout and restore a clean base branch before continuing.</p>}
      </div> : checkout?.ready && request.trim() ? <div className="mt-2">
        <Link to="/projects/$projectSlug/pipelines" params={{ projectSlug: project.slug }} hash="new-feature" aria-disabled={!canStartFeature} tabIndex={canStartFeature ? undefined : -1} onClick={(event: MouseEvent<HTMLAnchorElement>) => { if (!canStartFeature || !saveRequest(request)) event.preventDefault(); }} className={`inline-block rounded px-3 py-2 font-medium ${canStartFeature ? "bg-blue-700 text-white hover:bg-blue-600" : "cursor-not-allowed bg-zinc-700 text-zinc-300"}`}>Continue to plan setup</Link>
        {!canStartFeature && <p role="status" className="mt-1 text-xs text-amber-300">{unfinished?.length ? "Finish or inspect the unfinished workflow before starting another feature." : isError || !pipelines ? "Confirm workflow status before starting another feature." : "Checking checkout before plan setup."}</p>}
      </div> : <p className="mt-2 text-xs text-zinc-400">{request.trim() ? "Confirm checkout readiness to continue to plan setup." : "Enter a feature request to continue to plan setup."}</p>}
      {draftError && <p role="alert" className="mt-2 text-amber-300">Browser storage is unavailable. Copy your request into the feature form after opening the repository.</p>}
    </section>;
  return <li className="rounded border border-zinc-700 bg-zinc-900 p-4">
    {isError && <p role="status" className="mb-3 text-xs text-amber-300">Workflow status unavailable. Open the repository to check it.</p>}
    {unfinished?.length ? <section className="border-t border-zinc-700 pt-3" aria-label={`Unfinished workflow for ${project.name}`}>
      <h2 className="text-sm font-medium text-zinc-200">Continue unfinished work in {project.name}</h2>
      <ul><UnfinishedWorkflow project={project} pipeline={unfinished[0]} /></ul>
      {unfinished.length > 1 && <a href="#remaining-workflows" className="mt-2 inline-block text-xs text-blue-300 underline">See {unfinished.length - 1} other unfinished {unfinished.length === 2 ? "workflow" : "workflows"}</a>}
    </section> : null}
    {featureEntry}
    <Link to="/projects/$projectSlug/pipelines" params={{ projectSlug: project.slug }} className="block hover:text-blue-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
      <span className="block font-medium text-zinc-100">{project.name}</span>
      <span className="mt-1 block break-all font-mono text-xs text-zinc-400">{project.homeDir}</span>
      {checkout && !checkoutError && !checkingCheckout && <span className={`mt-2 block text-xs ${checkout.ready ? "text-emerald-300" : "text-amber-300"}`}>
        {checkout.ready ? `${checkout.note ? "Ready on base (Orch8 ignore change pending)" : "Checkout clean on base"} · ${checkout.branch}` :
          checkout.branch && checkout.branch !== checkout.baseBranch
            ? `On ${checkout.branch} · ${checkout.reason ?? "Finish or inspect existing work before starting another feature."}`
            : `Not ready for a new feature · ${checkout.reason ?? "Inspect the checkout."}`}
      </span>}
      {checkingCheckout && <span className="mt-2 block text-xs text-zinc-400">Checking checkout...</span>}
      {checkoutError && <span className="mt-2 block text-xs text-amber-300">Checkout status unavailable. Inspect the repository before starting.</span>}
      <span className="mt-2 block text-xs text-blue-300">Open feature workflows →</span>
    </Link>
    <button type="button" onClick={() => void refreshCheckout()} className="mt-2 text-xs text-blue-300 underline">Refresh checkout status</button>
    {checkout?.branch && checkout.branch !== checkout.baseBranch && !checkoutError && <div className="mt-2 text-xs text-zinc-400">
      <button type="button" onClick={() => void returnToBase()} disabled={returning || checkingCheckout || !!pipelines?.some(pipeline => pipeline.status === "running" || pipeline.status === "pending")}
        className="rounded border border-zinc-600 px-2 py-1 text-blue-300 disabled:opacity-40">{returning ? "Returning..." : `Return to ${checkout.baseBranch}`}</button>
      <p className="mt-1">Only a clean, idle checkout can switch branches. This does not reset or delete feature work.</p>
    </div>}
    {returnError && <p role="alert" className="mt-2 text-xs text-amber-300">{returnError}</p>}
    <details className="mt-3 border-t border-zinc-700 pt-3" onToggle={event => setInspectingChanges(event.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-medium text-blue-300">Inspect checkout diff and PR</summary>
      {inspectingChanges && <div className="mt-3"><RepositoryChanges projectId={project.id} /></div>}
    </details>
    <section className="mt-3 border-t border-zinc-700 pt-3 text-sm" aria-label={`Runtime readiness for ${project.name}`}>
      <h2 className="font-medium text-zinc-200">Check your agent runtime</h2>
      <p className="mt-1 text-xs text-zinc-400">Check before starting a workflow or preparing a branch. These checks do not start a workflow or approve the selected agents.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void checkCodex()} disabled={checkingCodex} className="rounded border border-zinc-600 px-3 py-2 text-blue-300 disabled:opacity-40">{checkingCodex ? "Checking Codex..." : "Check Codex sandbox (free)"}</button>
        <button type="button" onClick={() => void checkClaude()} disabled={checkingClaude} className="rounded border border-zinc-600 px-3 py-2 text-blue-300 disabled:opacity-40">{checkingClaude ? "Checking Claude..." : "Check Claude in this repository (may cost)"}</button>
      </div>
      <p className="mt-2 text-xs text-zinc-400">Codex runs a sandbox command in a disposable directory without a model call. Claude invokes its model and tests a temporary write in this checkout using existing permissions, against the project budget. You will check all selected agents again before starting.</p>
      {codexResult && <p role="status" className={`mt-2 text-xs ${codexResult.ok ? "text-emerald-300" : "text-amber-300"}`}>Codex: {codexResult.message}</p>}
      {codexResult && !codexResult.ok && <SandboxRecoveryGuidance adapterType="codex_local" message={codexResult.message} />}
      {claudeResult && <p role="status" className={`mt-2 text-xs ${claudeResult.ok ? "text-emerald-300" : "text-amber-300"}`}>Claude: {claudeResult.message}</p>}
      {claudeResult && !claudeResult.ok && <SandboxRecoveryGuidance adapterType="claude_local" message={claudeResult.message} />}
    </section>
    {unfinished && unfinished.length > 1 && <section id="remaining-workflows" className="mt-3 scroll-mt-6 border-t border-zinc-700 pt-3" aria-label={`Other unfinished workflows for ${project.name}`}>
      <h2 className="text-sm font-medium text-zinc-200">Other unfinished work</h2>
      <ul className="space-y-3">
        {unfinished.slice(1).map(pipeline => <UnfinishedWorkflow key={pipeline.id} project={project} pipeline={pipeline} />)}
      </ul>
    </section>}
    {!!completed?.length && <div className="mt-3 border-t border-zinc-700 pt-3 text-sm">
      <p className="text-zinc-300">Completed work: inspect PR status</p>
      <p className="mt-1 text-xs text-zinc-400">A completed workflow may or may not have a PR. Its diff reflects the current checkout; verify the branch before publishing.</p>
      <ul className="mt-2 space-y-2" aria-label={`Completed workflows for ${project.name}`}>
        {completed.map(pipeline => <li key={pipeline.id}>
          <Link to="/projects/$projectSlug/pipelines/$pipelineId" params={{ projectSlug: project.slug, pipelineId: pipeline.id }} className="text-blue-300 underline">Inspect {pipeline.name}</Link>
        </li>)}
      </ul>
    </div>}
  </li>;
}

function RepositoryChooser() {
  const { data: projects, isLoading, isError, refetch } = useProjects();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try { return localStorage.getItem("orch8:selected-repository"); } catch { return null; }
  });
  const active = projects?.filter(project => project.active) ?? [];
  const matching = active.filter(project =>
    `${project.name} ${project.homeDir}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const selected = matching.find(project => project.id === selectedId) ?? matching[0];

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
    {active.length > 0 && <>
      <div>
        <label htmlFor="repository-search" className="block text-sm font-medium text-zinc-200">Find a repository</label>
        <input id="repository-search" type="search" value={search} onChange={event => setSearch(event.target.value)}
          placeholder="Search name or checkout path" className="mt-2 w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-zinc-100" />
      </div>
      {matching.length === 0 ? <p role="status" className="text-sm text-zinc-400">No repositories match your search.</p> : <>
        <div className="grid min-w-0 items-start gap-4 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]" aria-label="Repository selection and feature entry">
          <ul className="grid min-w-0 max-h-32 grid-cols-[minmax(0,1fr)] gap-2 overflow-y-auto overflow-x-hidden pr-1 sm:sticky sm:top-4 sm:max-h-[calc(100vh-15rem)]" aria-label="Available repositories">
            {matching.map(project => <li key={project.id} className="min-w-0">
              <button type="button" onClick={() => {
                setSelectedId(project.id);
                try { localStorage.setItem("orch8:selected-repository", project.id); } catch { /* Selection still works without storage. */ }
              }} aria-pressed={selected.id === project.id}
                className={`w-full rounded border p-3 text-left text-sm hover:border-blue-500 ${selected.id === project.id ? "border-blue-500 bg-blue-950/40 text-white" : "border-zinc-700 bg-zinc-900 text-zinc-300"}`}>
                <span className="block font-medium">{project.name}</span>
                <span className="mt-1 block truncate font-mono text-xs text-zinc-400" title={project.homeDir}>{project.homeDir}</span>
              </button>
            </li>)}
          </ul>
          <ul className="min-w-0" aria-label="Selected repository details"><RepositoryCard key={selected.id} project={selected} /></ul>
        </div>
      </>}
    </>}
  </div>;
}

export const Route = createFileRoute("/")({ component: RepositoryChooser });
