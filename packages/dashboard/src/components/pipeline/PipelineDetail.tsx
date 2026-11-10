import { useRef, useState } from "react";
import {
  usePipeline,
  useRequestPlanChanges,
  usePlanAttempts,
  usePipelineDiff,
  usePublishPipelinePr,
  useCancelPipeline,
  useRetryPipeline,
  useRejectPipelineStep,
  useApprovePipelineStep,
  usePipelineStepOutput,
} from "../../hooks/usePipelines.js";
import { DownloadEvidence } from "./DownloadEvidence.js";
import { LogSearch } from "./LogSearch.js";
import { PipelineStepper } from "./PipelineStepper.js";
import { StalledRunDiagnosis } from "./StalledRunDiagnosis.js";
import { useRuns, useRunLog } from "../../hooks/useRuns.js";
import type { Run } from "../../types.js";
import { api, ApiError } from "../../api/client.js";
import { RunViewer } from "../runs/RunViewer.js";
import { GitDiffViewer } from "../diff/GitDiffViewer.js";
import { useEffect } from "react";
import type { Pipeline, PipelineStep } from "../../types.js";
import type { PipelineRepositoryDiff } from "../../hooks/usePipelines.js";

function FeatureProgress({ pipeline, steps, diff, diffLoading, diffError, canPublish, onReuse, featureRequest, reusing, reuseError }: {
  pipeline: Pipeline; steps: PipelineStep[]; diff?: PipelineRepositoryDiff;
  diffLoading: boolean; diffError: boolean; canPublish: boolean;
  onReuse: () => void; featureRequest: string; reusing: boolean; reuseError: string;
}) {
  const active = steps.find(step => step.order === pipeline.currentStep && step.status !== "completed")
    ?? steps.find(step => ["awaiting_verification", "running", "failed"].includes(step.status))
    ?? steps.find(step => step.status === "pending");
  const implement = steps.find(step => step.label.toLowerCase() === "implement");
  const review = steps.find(step => /\b(review|verification)\b/i.test(step.label));
  const { data: implementationRuns, isLoading: runsLoading, isError: runsError } = useRuns(
    pipeline.projectId, { taskId: implement?.taskId ?? "", limit: 20 }, !!implement?.taskId,
  );
  const { data: activeRuns } = useRuns(
    pipeline.projectId, { taskId: active?.taskId ?? "", limit: 20 },
    (active?.status === "pending" || active?.status === "failed") && !!active.taskId && active.taskId !== implement?.taskId,
  );
  const latestRun = implementationRuns?.[0];
  const activeRun = active?.taskId === implement?.taskId ? latestRun : activeRuns?.[0];
  const stalledStep = active?.status === "pending" && !!activeRun && ["succeeded", "failed", "cancelled"].includes(activeRun.status);
  const diagnosableRun = !!activeRun && !!active?.agentId && activeRun.agentId === active.agentId &&
    (stalledStep || active?.status === "failed") && ["succeeded", "failed", "cancelled"].includes(activeRun.status);
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState("");
  async function checkIncompleteStepRuntime() {
    if (!diagnosableRun || !active?.agentId || !active.taskId || retrying) return;
    setRetrying(true);
    setRetryMessage("");
    try {
      const agent = await api.get<{ adapterType: string; adapterConfig: Record<string, unknown> }>(
        `/agents/${encodeURIComponent(active.agentId)}`, { projectId: pipeline.projectId },
      );
      if (agent.adapterType === "codex_local") {
        if (agent.adapterConfig?.sandbox !== "workspace-write" ||
          agent.adapterConfig?.dangerouslyBypassApprovalsAndSandbox !== false) {
          throw new Error("This agent does not have the supported sandbox configuration. Check its settings before retrying.");
        }
      } else if (agent.adapterType === "claude_local") {
        if (agent.adapterConfig?.dangerouslySkipPermissions !== false) {
          throw new Error("This agent does not have the supported permission configuration. Check its settings before retrying.");
        }
      } else {
        throw new Error("This agent runtime is not supported for feature workflows.");
      }
      const check = await api.post<{ ok: boolean; message?: string }>(
        `/adapter/${agent.adapterType}/test-environment`, { config: agent.adapterConfig,
          ...(agent.adapterType === "claude_local" ? { projectId: pipeline.projectId } : {}) },
      );
      if (!check.ok) throw new Error(check.message ?? "Agent runtime check failed. No new run was started.");
      setRetryMessage("Agent runtime check passed. No run was queued by this check. Inspect the task and its previous run before resuming.");
    } catch (error) {
      setRetryMessage(`Runtime unavailable: ${error instanceof Error ? error.message : "Could not check the runtime."} No run was queued.`);
    } finally {
      setRetrying(false);
    }
  }
  let nextAction: string;
  if (pipeline.status === "failed") nextAction = "Inspect the failed step and its run log, then retry.";
  else if (pipeline.status === "cancelled") nextAction = "No action; workflow cancelled.";
  else if (stalledStep) nextAction = `Run ended without completing ${active.label.toLowerCase() === "implement" ? "implementation" : active.label.toLowerCase()}. Inspect its log before retrying.`;
  else if (active?.status === "awaiting_verification") {
    nextAction = active.label.toLowerCase() === "plan" ? "Read the plan and approve it or request changes."
      : /\b(review|verification)\b/i.test(active.label) ? "Read the independent review and accept or reject it."
        : `Review ${active.label} and approve or reject it.`;
  } else if (canPublish) nextAction = "Inspect the diff and run logs, then create a draft PR.";
  else if (pipeline.status === "completed" && !diffError && !diffLoading && diff?.available && diff.prLookup === "found") nextAction = "Inspect the repository PR and checks.";
  else if (pipeline.status === "completed" && !diffError && !diffLoading && diff?.available && diff.prLookup === "none") nextAction = "Publication not ready. Check the review and repository prerequisites below.";
  else if (pipeline.status === "completed") nextAction = "PR status unavailable. Check GitHub and repository prerequisites below.";
  else nextAction = "No decision needed yet; wait for the current step.";
  const decisionTarget = (pipeline.status === "running" || pipeline.status === "pending") && active?.status === "awaiting_verification"
    ? `#workflow-step-${active.id}` : null;
  const nextTarget = decisionTarget ?? (!diffError && !diffLoading && (canPublish || (pipeline.status === "completed" && diff?.prLookup === "none" && diff?.available))
    ? "#repository-changes" : null);
  const decisionLabel = active?.label ?? "step";
  const nextLabel = decisionTarget ? decisionLabel.toLowerCase() === "plan" ? "Review plan and decide" : /\b(review|verification)\b/i.test(decisionLabel) ? "Review findings and decide" : `Review ${decisionLabel} and decide`
    : canPublish ? "Inspect changes and publish draft PR" : "Inspect publication requirements";
  return <section aria-label="Feature progress" className="rounded border border-zinc-700 bg-zinc-900/60 p-4 text-sm text-zinc-300 space-y-3">
    <h4 className="font-semibold text-zinc-100">Feature progress</h4>
    {featureRequest && <details className="rounded border border-zinc-700 bg-zinc-950/60 p-3">
      <summary className="cursor-pointer font-medium text-zinc-200">Read the full feature request</summary>
      <p className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-zinc-300">{featureRequest}</p>
    </details>}
    <nav aria-label="Workflow evidence" className="flex flex-wrap gap-2 text-xs">
      {steps.filter(step => ["plan", "implement", "independent review", "review"].includes(step.label.toLowerCase())).map(step => (
        <a key={step.id} href={`#workflow-step-${step.id}`} className="rounded border border-zinc-700 px-3 py-2 text-blue-300 hover:bg-zinc-800">
          {step.label}: {step.status === "awaiting_verification" ? "needs your decision" : step.status}
        </a>
      ))}
      <a href="#repository-changes" className="rounded border border-zinc-700 px-3 py-2 text-blue-300 hover:bg-zinc-800">Repository diff</a>
      {!diffLoading && !diffError && diff?.available && diff.prLookup === "found" && diff.pullRequest &&
        <a href={diff.pullRequest.url} target="_blank" rel="noopener noreferrer" className="rounded border border-zinc-700 px-3 py-2 text-blue-300 hover:bg-zinc-800">PR #{diff.pullRequest.number} and checks</a>}
    </nav>
    {nextTarget && <a href={nextTarget} className="inline-flex w-fit rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300">{nextLabel}</a>}
    <div className="grid gap-3 sm:grid-cols-2">
      <p>Current stage: <span className="text-zinc-100">{pipeline.status === "completed" ? "Workflow completed" : pipeline.status === "cancelled" ? "Workflow cancelled" : active ? `${active.label} · ${active.status === "awaiting_verification" ? "awaiting approval" : active.status}` : pipeline.status}</span></p>
      <p>Next action: <span className="text-zinc-100">{nextAction}</span>{(stalledStep || pipeline.status === "failed") && active && activeRun && <a href={`#workflow-run-${activeRun.id}`} className="mt-2 block w-fit rounded border border-blue-600 px-3 py-2 text-blue-200">Inspect {active.label.toLowerCase()} run and log</a>}</p>
      <div>Implementation test evidence: {implement?.taskId ? <ImplementationEvidence run={latestRun} projectId={pipeline.projectId} isLoading={runsLoading} isError={runsError} /> : <span>No implementation run recorded yet.</span>}</div>
      <p>Review decision: <span className="text-zinc-100">{!review ? "No review step recorded" : review.outputSummary?.startsWith("[REJECTED]") ? "Rejected; changes requested" : review.status === "completed" ? review.requiresVerification ? "Accepted (test results still require inspection)" : "Completed; no human decision recorded" : review.status === "awaiting_verification" ? "Awaiting your decision" : review.status === "failed" ? "Review failed" : "Not decided"}</span></p>
      <p className="sm:col-span-2">Draft PR: {diffLoading ? "Checking repository..." : diffError || !diff?.available || diff.prLookup === "unavailable" ? "PR lookup unavailable; check GitHub." : diff.prLookup === "found" && diff.pullRequest ? <a href={diff.pullRequest.url} target="_blank" rel="noopener noreferrer" className="text-blue-300 underline">{diff.pullRequest.isDraft === true ? "Draft PR" : diff.pullRequest.isDraft === false ? "PR (not draft)" : "PR (draft status unknown)"} #{diff.pullRequest.number} · {diff.pullRequest.state.toLowerCase()}</a> : diff.prLookup === "none" ? "No PR found for this branch commit." : "Not verified for this branch commit."}</p>
    </div>
    {diagnosableRun && activeRun && active?.agentId && <StalledRunDiagnosis runId={activeRun.id} projectId={pipeline.projectId} agentId={active.agentId} />}
    {diagnosableRun && active?.agentId && active.taskId && <div className="space-y-2">
      <button type="button" disabled={retrying} onClick={() => void checkIncompleteStepRuntime()}
        className="rounded border border-amber-600 px-3 py-2 text-amber-200 disabled:opacity-50">
        {retrying ? "Checking runtime..." : `Check ${active.label.toLowerCase()} agent runtime`}
      </button>
      <p className="text-xs text-zinc-400">Checks the configured agent's runtime: Codex sandbox commands or Claude permissions in a disposable directory. Does not queue a run, approve a plan, or change permissions.</p>
      {retryMessage && <p role="status" className="text-xs text-amber-300">{retryMessage}</p>}
    </div>}
    {(stalledStep || pipeline.status === "failed" || pipeline.status === "cancelled") &&
      <div className="space-y-2 rounded border border-zinc-700 p-3">
        {featureRequest && <p>Want to try a different agent or model? Reuse this request in a new workflow. If this workflow is still open, it will be cancelled first. The repository branch and files are not changed; return to the base branch before starting again.</p>}
        {featureRequest ? <button type="button" onClick={onReuse} disabled={reusing} className="rounded border border-blue-500 px-3 py-2 text-blue-200 disabled:opacity-50">
          {reusing ? "Opening new feature..." : "Start again with this request"}
        </button> : <p>Could not recover the original feature request from this workflow. Copy it from the steps before creating a new feature; this workflow has not been cancelled.</p>}
        {reuseError && <p role="alert" className="text-red-300">{reuseError}</p>}
      </div>}
  </section>;
}

function ImplementationEvidence({ run, projectId, isLoading, isError }: { run?: Run; projectId: string; isLoading: boolean; isError: boolean }) {
  if (isLoading) return <span>Loading implementation runs...</span>;
  if (isError) return <span>Could not load implementation runs; test results unverified.</span>;

  if (!run) return <span>No run recorded for the current implementation task; test results unverified. <a href={`/projects/${encodeURIComponent(projectId)}/runs`} className="text-blue-300 underline">Inspect project runs for earlier attempts</a>.</span>;
  return <span>Run status: {run.status}; test results unverified. <a href={`#workflow-run-${run.id}`} className="text-blue-300 underline">Open run {run.id} and raw log</a>.</span>;
}

function RunEvidence({ run, projectId, onOpen }: { run: Run; projectId: string; onOpen: () => void }) {
  const anchor = `workflow-run-${run.id}`;
  const [open, setOpen] = useState(() => window.location.hash === `#${anchor}`);
  useEffect(() => {
    const openLinkedRun = () => {
      if (window.location.hash === `#${anchor}`) setOpen(true);
    };
    openLinkedRun();
    window.addEventListener("hashchange", openLinkedRun);
    return () => window.removeEventListener("hashchange", openLinkedRun);
  }, [anchor]);
  const live = run.status === "running";
  const { data: log, isLoading, isError, error, refetch } = useRunLog(open ? run.id : null, projectId, live);
  const wasLive = useRef(live);
  useEffect(() => {
    if (wasLive.current && !live && open) void refetch();
    wasLive.current = live;
  }, [live, open, refetch]);
  return <div id={anchor} className="scroll-mt-6 rounded border border-zinc-700 bg-zinc-950/60 p-2 space-y-2">
    <div className="flex flex-wrap items-center gap-2 text-zinc-300">
      <span className="font-mono">{run.id}</span>
      <span>{run.agentId} · Run status: {run.status}</span>
      <button type="button" onClick={onOpen} className="text-blue-300 underline" aria-label={`Open run viewer ${run.id}`}>Open run viewer (events and details)</button>
    </div>
    {run.error && <p role="alert" className="whitespace-pre-wrap break-words text-red-300">{run.error}</p>}
    <details open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-blue-300">Raw log</summary>
      {open && <div className="mt-2">
        {live && <p className="mb-2 text-zinc-400">Run in progress. Log refreshes every 3 seconds while open.</p>}
        <button type="button" onClick={() => void refetch()} className="mb-2 text-blue-300 underline">Refresh log now</button>
        {isLoading && <p role="status" className="text-zinc-400">Loading run log...</p>}
        {isError && (error instanceof ApiError && error.status === 404
          ? <p className="text-zinc-400">No stored log found for this run. It may not have been written or may be missing. <button type="button" onClick={() => void refetch()} className="text-blue-300 underline">Retry</button></p>
          : <p role="alert" className="text-amber-300">Could not load run log. <button type="button" onClick={() => void refetch()} className="underline">Retry</button></p>)}
        {!isLoading && !isError && log && (log.content
          ? <div className="space-y-3"><LogSearch content={log.content} /><pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded bg-zinc-900 p-3 font-mono text-xs text-zinc-200">{log.content}</pre></div>
          : <p className="text-zinc-400">Log is empty. <button type="button" onClick={() => void refetch()} className="text-blue-300 underline">Refresh log</button></p>)}
      </div>}
    </details>
  </div>;
}

function StepEvidence({ taskId, projectId, stepStatus, label }: { taskId: string; projectId: string; stepStatus: string; label: string }) {
  const { data: runs, isLoading, isError, refetch } = useRuns(projectId, { taskId, limit: 20 });
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  return <section id={label.toLowerCase() === "implement" ? "implementation-run-evidence" : undefined} aria-label={`${label} run evidence`} className="mt-2 space-y-2 text-xs">
    <a href={`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`} className="text-blue-300 underline">Open task {taskId}</a>
    <p className="text-zinc-500">Run status is not a test result. Inspect the raw log for actual test output.</p>
    {isLoading && <p role="status" className="text-zinc-400">Loading runs...</p>}
    {isError && <p role="alert" className="text-amber-300">Could not load runs. <button type="button" onClick={() => void refetch()} className="underline">Retry</button></p>}
    {!isLoading && !isError && runs?.length === 0 && <p className="text-zinc-400">No run recorded yet for this step.</p>}
    {runs?.map(run => <RunEvidence key={run.id} run={run} projectId={projectId} onOpen={() => setSelectedRun(run.id)} />)}
    {stepStatus === "pending" && runs?.[0]?.status === "succeeded" &&
      <p role="status" className="text-amber-300">Agent run ended without completing this step. Inspect its log before retrying.</p>}
    {selectedRun && <RunViewer runId={selectedRun} projectId={projectId} onClose={() => setSelectedRun(null)} />}
  </section>;
}

function StepOutput({ pipelineId, stepId, label, revision }: { pipelineId: string; stepId: string; label: string; revision: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, refetch } = usePipelineStepOutput(pipelineId, stepId, revision, open);
  return <div className="mt-2">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="text-xs text-blue-300 underline">
      {open ? "Hide" : "Inspect"} full {label.toLowerCase()} file
    </button>
    {open && <div className="mt-2 rounded border border-zinc-700 bg-zinc-950 p-3">
      {isLoading && <p className="text-xs text-zinc-400">Loading file...</p>}
      {isError && <p role="alert" className="text-xs text-amber-300">File unavailable or too large. Check the run log or repository. <button type="button" onClick={() => void refetch()} className="underline">Retry</button></p>}
      {data && <><p className="mb-2 break-all font-mono text-xs text-zinc-500">{data.path}</p>
        <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-200">{data.content || "(Empty file)"}</pre></>}
    </div>}
  </div>;
}

function PlanHistory({ pipelineId, projectId, poll }: { pipelineId: string; projectId: string; poll: boolean }) {
  const { data: attempts, isLoading, isError, refetch } = usePlanAttempts(pipelineId, true, poll);
  if (isLoading) return <p className="mt-2 text-xs text-zinc-400">Loading plan history...</p>;
  if (isError) return <p role="alert" className="mt-2 text-xs text-amber-300">Plan history unavailable. <button type="button" onClick={() => void refetch()} className="underline">Retry</button></p>;
  if (!attempts || attempts.length < 2) return null;
  return <section aria-label="Plan history" className="mt-3 space-y-2 text-xs">
    <h4 className="font-medium text-zinc-200">Plan attempts</h4>
    {attempts.map((attempt, index) => <details key={attempt.taskId} className="rounded border border-zinc-700 p-2">
      <summary className="cursor-pointer text-blue-300">Attempt {index + 1}: {attempt.taskId}</summary>
      <a href={`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(attempt.taskId)}`} className="underline text-blue-300">Open planning task and run</a>
      <p className="break-all font-mono text-zinc-500">{attempt.path}</p>
      {attempt.content === null ? <p className="text-amber-300">Plan file unavailable. Inspect the task run.</p>
        : <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words bg-zinc-950 p-3 text-zinc-200">{attempt.content || "(Empty file)"}</pre>}
    </details>)}
  </section>;
}

function PlanDecision({ pipelineId, stepId, revision, outputFilePath }: { pipelineId: string; stepId: string; revision: string; outputFilePath: string | null }) {
  const [reviewedContent, setReviewedContent] = useState<string | null>(null);
  const { data, isLoading, isError, isFetching, refetch } = usePipelineStepOutput(pipelineId, stepId, revision, !!outputFilePath);
  const approve = useApprovePipelineStep();
  const changes = useRequestPlanChanges();
  const [feedback, setFeedback] = useState("");
  const hasPlan = !isError && !isLoading && !isFetching && !!data?.content.trim();
  return <section aria-label="Plan approval" className="mt-3 space-y-3 rounded border border-amber-700/60 bg-amber-950/20 p-3">
    <h4 className="text-sm font-semibold text-amber-200">Review the plan before implementation</h4>
    {!outputFilePath && <p role="alert" className="text-xs text-amber-300">No plan file was recorded. Do not approve this step.</p>}
    {isLoading && <p className="text-xs text-zinc-400">Loading the recorded plan...</p>}
    {isError && <p role="alert" className="text-xs text-amber-300">File unavailable or too large. Check the run log or repository. <button type="button" onClick={() => void refetch()} className="underline">Retry</button></p>}
    {data && <><p className="break-all font-mono text-xs text-zinc-500">{data.path}</p>
      <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded bg-zinc-950 p-3 text-xs text-zinc-200">{data.content || "(Empty file)"}</pre></>}
    {data && !data.content.trim() && <p role="alert" className="text-xs text-amber-300">The plan file is empty. Do not approve this step.</p>}
    <label className="flex items-start gap-2 text-xs text-zinc-200">
      <input type="checkbox" checked={hasPlan && reviewedContent === data?.content} disabled={!hasPlan} onChange={event => setReviewedContent(event.target.checked ? data?.content ?? null : null)} />
      I have reviewed the full plan and want implementation to start.
    </label>
    <button type="button" onClick={() => approve.mutate({ pipelineId, stepId })} disabled={!hasPlan || reviewedContent !== data?.content || approve.isPending || changes.isPending}
      className="rounded bg-emerald-800 px-3 py-1 text-xs text-emerald-200 disabled:opacity-50">{approve.isPending ? "Approving..." : "Approve plan"}</button>
    <form onSubmit={event => { event.preventDefault(); if (feedback.trim()) changes.mutate({ pipelineId, stepId, feedback: feedback.trim() }); }} className="space-y-2">
      <label className="block text-xs text-zinc-200">Plan feedback
        <textarea value={feedback} onChange={event => setFeedback(event.target.value)} maxLength={10000} disabled={changes.isPending || approve.isPending} className="mt-1 block w-full rounded bg-zinc-950 p-2" />
      </label>
      <p className="text-xs text-zinc-400">Request a revised plan. Implementation will still need your approval.</p>
      <button type="submit" disabled={!feedback.trim() || changes.isPending || approve.isPending} className="rounded bg-amber-800 px-3 py-1 text-xs text-amber-100 disabled:opacity-50">{changes.isPending ? "Requesting changes..." : "Request changes"}</button>
      {changes.error && <p role="alert" className="text-xs text-red-300">{changes.error.message}</p>}
    </form>
    {approve.error && <p role="alert" className="text-xs text-red-300">{approve.error.message}</p>}
  </section>;
}

function ImplementationTestLog({ projectId, taskId }: { projectId: string; taskId?: string }) {
  const [open, setOpen] = useState(false);
  const { data: runs, isLoading: runsLoading, isError: runsError, refetch: refreshRuns } = useRuns(
    projectId, { taskId: taskId ?? "", limit: 1 }, !!taskId,
  );
  const run = runs?.[0];
  const { data: log, isLoading: logLoading, isError: logError, refetch: refreshLog } = useRunLog(
    open ? run?.id ?? null : null, projectId,
  );
  return <section aria-label="Implementation test log" className="space-y-2 rounded border border-zinc-700 bg-zinc-950/60 p-3 text-xs">
    <h5 className="font-semibold text-zinc-200">Implementation test output</h5>
    <p className="text-zinc-400">Read the actual agent run log here before accepting the review. A successful process exit does not mean tests passed; confirm the command, exit code and output yourself.</p>
    {!taskId ? <p role="alert" className="text-amber-300">No implementation task was recorded.</p> : runsLoading ? <p>Loading implementation run...</p> : runsError ?
      <p role="alert" className="text-amber-300">Could not load implementation runs. <button type="button" onClick={() => void refreshRuns()} className="underline">Retry</button></p> : !run ?
        <p role="alert" className="text-amber-300">No implementation run found. Check the task before accepting.</p> : <>
          <p>Latest run: <span className="font-mono">{run.id}</span> · process status: {run.status}</p>
          <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="text-blue-300 underline">{open ? "Hide" : "Read"} implementation run log</button>
          {open && (logLoading ? <p>Loading raw log...</p> : logError ?
            <p role="alert" className="text-amber-300">Could not load raw log. <button type="button" onClick={() => void refreshLog()} className="underline">Retry</button></p> : log?.content ?
              <div className="space-y-3"><LogSearch content={log.content} /><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-zinc-900 p-3 font-mono text-zinc-200" aria-label="Full implementation run log">{log.content}</pre></div> :
              <p role="alert" className="text-amber-300">No raw output stored for this run. <button type="button" onClick={() => void refreshLog()} className="underline">Refresh log</button></p>)}
        </>}
  </section>;
}

function ReviewDecision({ pipelineId, stepId, revision, outputFilePath, prEligibleLabel, diff, diffLoading, diffError, projectId, implementationTaskId }: { pipelineId: string; stepId: string; revision: string; outputFilePath: string | null; prEligibleLabel: boolean; diff?: PipelineRepositoryDiff; diffLoading: boolean; diffError: boolean; projectId: string; implementationTaskId?: string }) {
  const [reviewedContent, setReviewedContent] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [changed, setChanged] = useState(false);
  const { data, isLoading, isError, isFetching, refetch } = usePipelineStepOutput(pipelineId, stepId, revision, !!outputFilePath);
  const approve = useApprovePipelineStep();
  const hasReport = !isError && !isLoading && !isFetching && !!data?.content.trim();
  async function accept() {
    if (!hasReport || reviewedContent !== data?.content || checking) return;
    setChecking(true);
    try {
      const current = await refetch();
      if (current.isError || !current.data?.content.trim() || current.data.content !== reviewedContent) {
        setReviewedContent(null);
        setChanged(true);
        return;
      }
      approve.mutate({ pipelineId, stepId });
    } catch {
      setReviewedContent(null);
      setChanged(true);
    } finally {
      setChecking(false);
    }
  }
  return <section aria-label="Independent review decision" className="mt-3 space-y-3 rounded border border-amber-700/60 bg-amber-950/20 p-3">
    <h4 className="text-sm font-semibold text-amber-200">Decide whether the independent review passes</h4>
    <p className="text-xs text-zinc-400">Read the review findings and inspect the repository diff and run logs before accepting. Approval records your decision; it does not verify the tests or publish a PR.</p>
    {!prEligibleLabel && <p className="text-xs text-amber-300">The built-in draft PR action requires a final step named Review or Independent review. This custom verification step can finish the workflow, but cannot use that PR action.</p>}
    {!outputFilePath && <p role="alert" className="text-xs text-amber-300">No review file was recorded. Inspect the run log and reject this step.</p>}
    {isLoading && <p className="text-xs text-zinc-400">Loading the recorded review...</p>}
    {isError && <p role="alert" className="text-xs text-amber-300">Review file unavailable or too large. Check the run log or repository. <button type="button" onClick={() => void refetch()} className="underline">Retry</button></p>}
    {data && <><p className="break-all font-mono text-xs text-zinc-500">{data.path}</p>
      <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded bg-zinc-950 p-3 text-xs text-zinc-200">{data.content || "(Empty file)"}</pre></>}
    {data && !data.content.trim() && <p role="alert" className="text-xs text-amber-300">The review file is empty. Reject this step.</p>}
    <section aria-label="Changes to inspect for review" className="space-y-2 rounded border border-zinc-700 bg-zinc-950/60 p-3 text-xs">
      <h5 className="font-semibold text-zinc-200">Changes to inspect before deciding</h5>
      <p className="text-zinc-400">This is a live repository-wide snapshot, not the exact diff the reviewer saw. <a href="#repository-changes" className="text-blue-300 underline">Open the full repository view</a> and use Refresh diff to update it. Test output must be checked in the <a href="#implementation-run-evidence" className="text-blue-300 underline">implementation run log</a>.</p>
      {diffLoading && <p>Loading repository changes...</p>}
      {diffError && <p role="alert" className="text-amber-300">Repository changes could not be loaded. Inspect the checkout before accepting.</p>}
      {!diffLoading && !diffError && !diff?.available && <p role="alert" className="text-amber-300">Repository changes unavailable: {diff?.reason ?? "Check the checkout before accepting."}</p>}
      {!diffLoading && !diffError && diff?.available && <>
        <p>Branch: <span className="font-mono">{diff.branch ?? "detached HEAD"}</span> · base: <span className="font-mono">{diff.baseBranch}</span></p>
        <details><summary className="cursor-pointer text-blue-300">Committed changes</summary><div className="mt-2 max-h-80 overflow-auto"><GitDiffViewer diff={diff.committedDiff ?? ""} projectId={projectId} /></div></details>
        <details><summary className="cursor-pointer text-blue-300">Uncommitted changes and untracked names</summary><div className="mt-2 max-h-80 overflow-auto"><GitDiffViewer diff={diff.workingDiff ?? ""} projectId={projectId} />
          {diff.untrackedFiles?.length ? <ul className="mt-2 font-mono text-zinc-300">{diff.untrackedFiles.map(path => <li key={path}>{path}</li>)}</ul> : <p>No untracked names reported.</p>}
          {diff.untrackedMore && <p className="text-amber-300">More untracked names exist than shown.</p>}
        </div></details>
      </>}
    </section>
    <ImplementationTestLog projectId={projectId} taskId={implementationTaskId} />
    {changed && <p role="alert" className="text-xs text-amber-300">The review changed or could not be refreshed. Read the current report and confirm again.</p>}
    <label className="flex items-start gap-2 text-xs text-zinc-200">
      <input type="checkbox" checked={hasReport && reviewedContent === data?.content} disabled={!hasReport} onChange={event => { setReviewedContent(event.target.checked ? data?.content ?? null : null); setChanged(false); }} />
      I read the full independent review and found no blocking findings.
    </label>
    <button type="button" onClick={() => { void accept(); }} disabled={!hasReport || reviewedContent !== data?.content || checking || approve.isPending}
      className="rounded bg-emerald-800 px-3 py-1 text-xs text-emerald-200 disabled:opacity-50">{checking ? "Checking review..." : approve.isPending ? "Approving..." : "Accept review"}</button>
  </section>;
}

interface PipelineDetailProps {
  pipelineId: string;
  projectId?: string;
}

export function PipelineDetail({ pipelineId, projectId }: PipelineDetailProps) {
  const { data, isLoading, refetch } = usePipeline(pipelineId);
  const { data: repositoryDiff, isLoading: diffLoading, isFetching: diffRefreshing, isError: diffError, refetch: refreshDiff } = usePipelineDiff(pipelineId);
  const refreshedReview = useRef("");
  const actionableReview = data?.steps.find(step => /\b(review|verification)\b/i.test(step.label) && step.status === "awaiting_verification");
  const reviewKey = actionableReview ? `${pipelineId}:${actionableReview.id}:${actionableReview.updatedAt ?? ""}` : "";
  useEffect(() => {
    if (reviewKey && refreshedReview.current !== reviewKey) {
      refreshedReview.current = reviewKey;
      void refreshDiff();
    }
  }, [reviewKey, refreshDiff]);
  const cancelMutation = useCancelPipeline();
  const retryMutation = useRetryPipeline();
  const rejectMutation = useRejectPipelineStep();
  const approveMutation = useApprovePipelineStep();
  const publishMutation = usePublishPipelinePr();
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [prSummary, setPrSummary] = useState("");
  const [prTests, setPrTests] = useState("");
  const [rejectingStepId, setRejectingStepId] = useState<string | null>(null);
  const [targetStepId, setTargetStepId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [reusing, setReusing] = useState(false);
  const [reuseError, setReuseError] = useState("");
  useEffect(() => {
    if (data?.pipeline.status === "completed" || data?.pipeline.status === "cancelled") return;
    const timer = setInterval(() => { void refetch(); }, 5000);
    return () => clearInterval(timer);
  }, [data?.pipeline.status, pipelineId, refetch]);
  const focusedStep = useRef("");
  useEffect(() => {
    if (!data) return;
    const showLinkedStep = () => {
      const step = data.steps.find(item => window.location.hash === `#workflow-step-${encodeURIComponent(item.id)}`);
      if (!step) return;
      const key = `${pipelineId}:${step.id}`;
      if (focusedStep.current === key) return;
      const target = document.getElementById(`workflow-step-${step.id}`);
      if (!target) return;
      focusedStep.current = key;
      target.scrollIntoView({ block: "start" });
      target.focus({ preventScroll: true });
    };
    const frame = requestAnimationFrame(showLinkedStep);
    const onHashChange = () => { focusedStep.current = ""; requestAnimationFrame(showLinkedStep); };
    window.addEventListener("hashchange", onHashChange);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hashchange", onHashChange); };
  }, [data, pipelineId]);

  if (isLoading || !data) {
    return <p className="text-sm text-zinc-600">Loading pipeline...</p>;
  }

  const { pipeline, steps } = data;
  const isReviewDecision = (step: typeof steps[number]) => /\b(review|verification)\b/i.test(step.label);
  const implement = steps.find(step => step.label.toLowerCase() === "implement");
  const review = steps.find(step => ["review", "independent review"].includes(step.label.toLowerCase()));
  const originalPrompt = implement?.promptOverride;
  const suffix = "\nFollow the approved plan in {{pipeline.context}}.";
  const suffixAt = originalPrompt?.lastIndexOf(suffix) ?? -1;
  const reusableRequest = originalPrompt?.startsWith("Feature request: ") && suffixAt > "Feature request: ".length
    ? originalPrompt.slice("Feature request: ".length, suffixAt).trim() : "";
  const outputPaths = new Set([...steps.map(step => step.outputFilePath).filter(Boolean), ...(repositoryDiff?.publicationOutputPaths ?? [])]);
  const canPublish = pipeline.status === "completed" && steps.every(step => step.status === "completed") &&
    !!implement?.agentId && !!review?.agentId && !!review.requiresVerification && implement.agentId !== review.agentId &&
    review.order > implement.order && review.order === steps.length &&
    !!review.outputSummary?.trim() && !review.outputSummary.startsWith("[REJECTED]") &&
    repositoryDiff?.available && repositoryDiff.branch && repositoryDiff.branch !== repositoryDiff.baseBranch &&
    repositoryDiff.prLookup === "none" && !!repositoryDiff.committedDiff &&
    !repositoryDiff.workingDiff && !repositoryDiff.untrackedFiles?.some(path => !outputPaths.has(path)) && !repositoryDiff.untrackedMore;
  const publicationBlockers = pipeline.status === "completed" && repositoryDiff?.available && repositoryDiff.prLookup === "none" ? [
    !repositoryDiff.committedDiff && "No committed feature changes. The implementer must commit the reviewed feature files on the prepared branch.",
    !!repositoryDiff.workingDiff && "Staged or unstaged changes remain. Inspect them before publishing; only committed changes go into the PR.",
    (repositoryDiff.untrackedFiles?.some(path => !outputPaths.has(path)) || repositoryDiff.untrackedMore) && "Untracked files remain outside recorded pipeline output. Inspect them before publishing.",
  ].filter((message): message is string => !!message) : [];

  async function reuseRequest() {
    if (reusing) return;
    setReuseError("");
    const key = `orch8:feature-draft:${pipeline.projectId}`;
    if (!reusableRequest) { setReuseError("Could not recover the original request. This workflow has not been cancelled."); return; }
    let previousDraft: string | null = null;
    let draftWritten = false;
    try {
      previousDraft = localStorage.getItem(key);
      if (previousDraft && !window.confirm("Replace the unsent feature draft in this browser with this workflow's request?")) return;
      setReusing(true);
      localStorage.setItem(key, JSON.stringify({ feature: reusableRequest, branchName: "", planner: "", implementer: "", reviewer: "", filePaths: [] }));
      draftWritten = true;
      // A failed cancel must not open another workflow against this checkout.
      if (pipeline.status === "pending" || pipeline.status === "running") await cancelMutation.mutateAsync(pipeline.id);
      draftWritten = false;
      window.location.assign(`/projects/${encodeURIComponent(pipeline.projectId)}/pipelines#new-feature`);
    } catch (error) {
      if (draftWritten) {
        try {
          if (previousDraft === null) localStorage.removeItem(key);
          else localStorage.setItem(key, previousDraft);
        } catch { /* The old workflow remains available if storage is unavailable. */ }
      }
      setReuseError(error instanceof Error ? error.message : "Could not open a new feature. Inspect the old workflow before retrying.");
      setReusing(false);
    }
  }

  function handleRejectSubmit(stepId: string) {
    if (!targetStepId || !feedback.trim()) return;
    rejectMutation.mutate(
      { pipelineId: pipeline.id, stepId, targetStepId, feedback },
      {
        onSuccess: () => {
          setRejectingStepId(null);
          setTargetStepId("");
          setFeedback("");
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-[var(--gap-block)]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">{pipeline.name}</h3>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            pipeline.status === "completed"
              ? "bg-emerald-900/50 text-emerald-300"
              : pipeline.status === "failed"
                ? "bg-red-900/50 text-red-300"
                : pipeline.status === "cancelled"
                  ? "bg-zinc-800 text-zinc-400"
                  : "bg-blue-900/50 text-blue-300"
          }`}
        >
          {pipeline.status}
        </span>
      </div>

      {steps[0]?.label.toLowerCase() === "plan" && implement && review &&
        <FeatureProgress pipeline={pipeline} steps={steps} diff={repositoryDiff} diffLoading={diffLoading} diffError={diffError} canPublish={!!canPublish} onReuse={() => void reuseRequest()} featureRequest={reusableRequest} reusing={reusing} reuseError={reuseError} />}
      {steps[0]?.label.toLowerCase() === "plan" && implement && review &&
        <DownloadEvidence key={pipeline.id} pipelineId={pipeline.id} />}
      <PipelineStepper steps={steps} currentStep={pipeline.currentStep} />

      <section id="repository-changes" aria-label="Repository changes" className="scroll-mt-6 rounded border border-zinc-800 p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-medium text-zinc-200">Current repository changes</h4>
          <button type="button" onClick={() => { void refreshDiff(); }} className="text-xs text-blue-300 underline">Refresh diff</button>
        </div>
        <p className="text-xs text-zinc-400">
          Live snapshot of committed branch changes and staged/unstaged edits. Untracked file names are listed, but their contents are not shown; submodule changes are excluded. This is not a per-step diff. Test results are available only in run logs, not verified by this view.
        </p>
        {diffLoading && <p className="text-xs text-zinc-500">Loading repository diff...</p>}
        {diffError && <p role="alert" className="text-xs text-amber-300">Could not load repository diff. Try refreshing.</p>}
        {repositoryDiff && !repositoryDiff.available && <p className="text-xs text-amber-300">{repositoryDiff.reason ?? "Repository diff unavailable."}</p>}
        {repositoryDiff?.available && !diffError && <div className="space-y-4">
          <div className="rounded border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-300 space-y-1">
            <p>Checked-out branch: <span className="font-mono">{repositoryDiff.branch ?? "detached HEAD"}</span></p>
            {repositoryDiff.pullRequest ? <p>
              GitHub PR for this exact branch commit: <a className="text-blue-300 underline" href={repositoryDiff.pullRequest.url} target="_blank" rel="noopener noreferrer">
                #{repositoryDiff.pullRequest.number} {repositoryDiff.pullRequest.title}
              </a> ({repositoryDiff.pullRequest.state.toLowerCase()})
            </p> : repositoryDiff.prLookup === "none" ? <p>No GitHub PR found for this branch commit and configured base. Uncommitted changes are not part of a PR.</p>
              : repositoryDiff.prLookup === "unavailable" ? <p>PR lookup unavailable. Check GitHub authentication and the repository origin.</p>
                : <p>PR lookup applies to named branches other than the configured base.</p>}
            {repositoryDiff.pullRequest && <div aria-label="GitHub checks for current commit">
              <p>GitHub checks for this commit:</p>
              {repositoryDiff.pullRequest.checks?.length ? <ul className="ml-4 list-disc">
                {repositoryDiff.pullRequest.checks.map((check, index) => <li key={`${check.name}-${index}`}>
                  {check.url ? <a className="text-blue-300 underline" href={check.url} target="_blank" rel="noopener noreferrer">{check.name}: {check.status}</a>
                    : <span>{check.name}: {check.status}</span>}
                </li>)}
              </ul> : <p className="text-amber-300">No checks reported for this commit. This does not mean tests passed.</p>}
            </div>}
            <p className="text-zinc-500">This is a repository-wide snapshot, not proof that the pipeline created the PR. Refresh to check again.</p>
          </div>
          {canPublish && <div className="rounded border border-blue-800/60 bg-blue-950/20 p-3 space-y-2 text-xs">
            <p className="text-zinc-300">Independent review completed. Create a draft PR from the current committed branch to {repositoryDiff.baseBranch}. Review the exact diff and tests on GitHub: this branch commit is not cryptographically tied to the pipeline review. This does not commit files, run checks, or merge.</p>
            {!confirmPublish ? <button type="button" onClick={() => setConfirmPublish(true)} className="rounded bg-blue-800 px-3 py-1 text-blue-100">Create pull request</button> : <div className="space-y-2">
              <p>Confirm: this publishes the committed branch {repositoryDiff.branch} to {repositoryDiff.baseBranch} on GitHub. The PR includes the current commit and your notes. Do not include secrets. Verify the review and diff first.</p>
              <label className="block text-zinc-200">Summary for PR reviewers
                <textarea value={prSummary} onChange={event => setPrSummary(event.target.value)} maxLength={2000} rows={3} className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-950 p-2" placeholder="What changed and why?" />
              </label>
              <label className="block text-zinc-200">Test notes for PR reviewers
                <textarea value={prTests} onChange={event => setPrTests(event.target.value)} maxLength={2000} rows={3} className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-950 p-2" placeholder="Copy the command, exit code, and relevant result you inspected in the implementation log. Leave blank if unknown." />
              </label>
              <p className="text-zinc-400">These are operator-supplied notes, not verified test results. The draft PR says so even when this field is filled.</p>
              <button type="button" disabled={publishMutation.isPending} onClick={() => publishMutation.mutate({ pipelineId: pipeline.id, summary: prSummary, tests: prTests }, { onSuccess: () => { setConfirmPublish(false); void refreshDiff(); } })} className="rounded bg-blue-800 px-3 py-1 text-blue-100 disabled:opacity-50">{publishMutation.isPending ? "Publishing..." : "Confirm create pull request"}</button>{" "}
              <button type="button" disabled={publishMutation.isPending} onClick={() => setConfirmPublish(false)} className="text-zinc-400 underline">Cancel</button>
            </div>}
          </div>}
          {publicationBlockers.length > 0 && <div role="status" className="rounded border border-amber-800/60 bg-amber-950/20 p-3 text-xs text-amber-200">
            <p className="font-medium">Draft PR not ready. Other review and repository requirements may also apply.</p>
            <ul className="ml-4 mt-1 list-disc space-y-1">{publicationBlockers.map(message => <li key={message}>{message}</li>)}</ul>
          </div>}
          {publishMutation.isError && <p role="alert" className="text-amber-300 text-xs">{publishMutation.error instanceof Error ? publishMutation.error.message : "PR publication failed. Inspect GitHub before retrying."}</p>}
          {publishMutation.data && <p role="status" className="text-xs text-emerald-300">Pull request created: <a href={publishMutation.data.url} target="_blank" rel="noopener noreferrer" className="underline">{publishMutation.data.url}</a></p>}
          <div>
            <h5 className="text-xs font-medium text-zinc-300 mb-2">Committed changes since {repositoryDiff.baseBranch}</h5>
            <GitDiffViewer diff={repositoryDiff.committedDiff ?? ""} projectId={pipeline.projectId} />
          </div>
          <div>
            <h5 className="text-xs font-medium text-zinc-300 mb-2">Staged and unstaged changes</h5>
            <GitDiffViewer diff={repositoryDiff.workingDiff ?? ""} projectId={pipeline.projectId} />
          </div>
          <div>
            <h5 className="text-xs font-medium text-zinc-300 mb-1">Untracked files (names only)</h5>
            {repositoryDiff.untrackedFiles?.length ? <ul className="text-xs text-zinc-400 font-mono space-y-1">
              {repositoryDiff.untrackedFiles.map(path => <li key={path} className="break-all">{path}</li>)}
            </ul> : <p className="text-xs text-zinc-500">None found</p>}
            {repositoryDiff.publicationOutputPaths?.length ? <div className="text-xs text-zinc-400">
              <p>Recorded pipeline artifacts allowed to remain untracked for publication:</p>
              <ul className="font-mono">{repositoryDiff.publicationOutputPaths.map(path => <li key={path}>{path}</li>)}</ul>
            </div> : null}
            {repositoryDiff.untrackedMore && <p className="text-xs text-amber-300">More untracked files exist; only the first 20 names are shown.</p>}
          </div>
        </div>}
      </section>

      {/* Step details */}
      <div className="flex flex-col gap-[var(--gap-inline)]">
        {steps.map((step) => (
          <div key={step.id} id={`workflow-step-${step.id}`} tabIndex={-1} className="scroll-mt-6 rounded border border-zinc-800 p-3">
            <p className="text-sm font-medium text-zinc-200">{step.label} <span className="text-xs text-zinc-500">{step.status}</span></p>
            {step.taskId ? <StepEvidence taskId={step.taskId} projectId={projectId ?? pipeline.projectId} stepStatus={step.status} label={step.label} /> :
              <p className="mt-2 text-xs text-zinc-400">No task or run recorded yet for this step.</p>}
            {step.order === 1 && step.label.toLowerCase() === "plan" && step.status === "awaiting_verification" ?
              <PlanDecision key={`${step.id}:${step.updatedAt ?? ""}`} pipelineId={pipeline.id} stepId={step.id} revision={String(step.updatedAt ?? step.outputSummary ?? "")} outputFilePath={step.outputFilePath ?? null} /> :
              isReviewDecision(step) && step.status === "awaiting_verification" ?
                <ReviewDecision key={`${step.id}:${step.updatedAt ?? ""}`} pipelineId={pipeline.id} stepId={step.id} revision={String(step.updatedAt ?? step.outputSummary ?? "")} outputFilePath={step.outputFilePath ?? null} prEligibleLabel={["review", "independent review"].includes(step.label.toLowerCase())} diff={repositoryDiff} diffLoading={diffLoading || !!diffRefreshing} diffError={diffError} projectId={pipeline.projectId} implementationTaskId={implement?.taskId ?? undefined} /> :
                step.outputFilePath && (step.status === "completed" || step.status === "awaiting_verification") &&
                <StepOutput pipelineId={pipeline.id} stepId={step.id} label={step.label} revision={String(step.updatedAt ?? step.outputSummary ?? "")} />}
            {step.order === 1 && step.label.toLowerCase() === "plan" &&
              <PlanHistory pipelineId={pipeline.id} projectId={projectId ?? pipeline.projectId} poll={["pending", "running", "awaiting_verification"].includes(step.status)} />}
            {step.status === "awaiting_verification" && !step.outputSummary &&
              <p role="alert" className="mt-2 text-xs text-amber-300">No plan or review summary is available. Inspect the task and run log before approving.</p>}
            {step.outputSummary && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
                  {step.label} output
                  {step.outputSummary.startsWith("[REJECTED]") && (
                    <span className="ml-1 text-red-400">(rejected)</span>
                  )}
                </summary>
                <div className="mt-1 max-h-40 overflow-auto rounded bg-zinc-950 p-2">
                  <pre className="text-xs text-zinc-400 whitespace-pre-wrap">{step.outputSummary}</pre>
                </div>
                {step.outputFilePath && (
                  <p className="mt-1 font-mono text-xs text-zinc-600">
                    {step.outputFilePath}
                  </p>
                )}
              </details>
            )}

            {/* Reject button: show for completed or running steps that are not the first step */}
            {(step.status === "completed" || step.status === "running") &&
              step.order > 1 &&
              (pipeline.status === "running" || pipeline.status === "pending") && (
                <div className="mt-1">
                  {rejectingStepId === step.id ? (
                    <div className="space-y-2 rounded border border-zinc-700 bg-zinc-800/50 p-3">
                      <select
                        value={targetStepId}
                        onChange={(e) => setTargetStepId(e.target.value)}
                        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-200"
                      >
                        <option value="">Select target step...</option>
                        {steps
                          .filter((s) => s.order < step.order)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              Step {s.order}: {s.label}
                            </option>
                          ))}
                      </select>
                      <textarea
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="Rejection feedback..."
                        rows={3}
                        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-200"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRejectSubmit(step.id)}
                          disabled={!targetStepId || !feedback.trim() || rejectMutation.isPending}
                          className="rounded bg-red-800 px-3 py-1 text-xs text-red-200 hover:bg-red-700 disabled:opacity-50"
                        >
                          {rejectMutation.isPending ? "Rejecting..." : "Reject"}
                        </button>
                        <button
                          onClick={() => {
                            setRejectingStepId(null);
                            setTargetStepId("");
                            setFeedback("");
                          }}
                          className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setRejectingStepId(step.id)}
                      className="text-xs text-zinc-600 hover:text-red-400"
                    >
                      Reject
                    </button>
                  )}
                </div>
              )}

            {/* Approve / Reject for steps awaiting verification */}
            {step.status === "awaiting_verification" && !(step.order === 1 && step.label.toLowerCase() === "plan") && (
              <div className="mt-2 space-y-2">
                <div className="flex gap-2">
                  {!isReviewDecision(step) && <button
                    onClick={() =>
                      approveMutation.mutate({ pipelineId: pipeline.id, stepId: step.id })
                    }
                    disabled={approveMutation.isPending}
                    className="rounded bg-emerald-800 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {approveMutation.isPending ? "Approving..." : "Approve"}
                  </button>}
                  {step.order > 1 && (
                    <button
                      onClick={() => setRejectingStepId(step.id)}
                      className="rounded bg-red-800 px-3 py-1 text-xs text-red-200 hover:bg-red-700"
                    >
                      Reject
                    </button>
                  )}
                </div>
                {rejectingStepId === step.id && step.order > 1 && (
                  <div className="space-y-2 rounded border border-zinc-700 bg-zinc-800/50 p-3">
                    <select
                      value={targetStepId}
                      onChange={(e) => setTargetStepId(e.target.value)}
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-200"
                    >
                      <option value="">Select target step...</option>
                      {steps
                        .filter((s) => s.order < step.order)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            Step {s.order}: {s.label}
                          </option>
                        ))}
                    </select>
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="Rejection feedback..."
                      rows={3}
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-200"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRejectSubmit(step.id)}
                        disabled={!targetStepId || !feedback.trim() || rejectMutation.isPending}
                        className="rounded bg-red-800 px-3 py-1 text-xs text-red-200 hover:bg-red-700 disabled:opacity-50"
                      >
                        {rejectMutation.isPending ? "Rejecting..." : "Confirm Reject"}
                      </button>
                      <button
                        onClick={() => {
                          setRejectingStepId(null);
                          setTargetStepId("");
                          setFeedback("");
                        }}
                        className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {(pipeline.status === "pending" || pipeline.status === "running") && (
          <button
            onClick={() => cancelMutation.mutate(pipeline.id)}
            disabled={cancelMutation.isPending}
            className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
          >
            Cancel
          </button>
        )}
        {pipeline.status === "failed" && (
          <button
            onClick={() => retryMutation.mutate(pipeline.id)}
            disabled={retryMutation.isPending}
            className="rounded border border-amber-700 px-3 py-1 text-xs text-amber-400 hover:bg-amber-900/30"
          >
            Retry Failed Step
          </button>
        )}
      </div>
    </div>
  );
}
