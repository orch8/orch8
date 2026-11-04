import { useState } from "react";
import {
  usePipeline,
  usePipelineDiff,
  usePublishPipelinePr,
  useCancelPipeline,
  useRetryPipeline,
  useRejectPipelineStep,
  useApprovePipelineStep,
  usePipelineStepOutput,
} from "../../hooks/usePipelines.js";
import { PipelineStepper } from "./PipelineStepper.js";
import { useRuns } from "../../hooks/useRuns.js";
import { RunViewer } from "../runs/RunViewer.js";
import { GitDiffViewer } from "../diff/GitDiffViewer.js";
import { useEffect } from "react";

function StepEvidence({ taskId, projectId, stepStatus }: { taskId: string; projectId: string; stepStatus: string }) {
  const { data: runs } = useRuns(projectId, { taskId, limit: 20 });
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  return <div className="mt-2 space-y-1 text-xs">
    <a href={`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`} className="text-blue-300 underline">Open task {taskId}</a>
    {runs?.map(run => <div key={run.id}>
      <button type="button" onClick={() => setSelectedRun(run.id)} className="text-blue-300 underline">{run.agentId} run: {run.status} (log and events)</button>
      {run.status === "failed" && run.error && <p role="alert" className="text-red-300">{run.error}</p>}
    </div>)}
    {stepStatus === "pending" && runs?.[0]?.status === "succeeded" &&
      <p role="status" className="text-amber-300">Agent run ended without completing this step. Inspect its log before retrying.</p>}
    {selectedRun && <RunViewer runId={selectedRun} projectId={projectId} onClose={() => setSelectedRun(null)} />}
  </div>;
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

function PlanDecision({ pipelineId, stepId, revision, outputFilePath }: { pipelineId: string; stepId: string; revision: string; outputFilePath: string | null }) {
  const [reviewedContent, setReviewedContent] = useState<string | null>(null);
  const { data, isLoading, isError, isFetching, refetch } = usePipelineStepOutput(pipelineId, stepId, revision, !!outputFilePath);
  const approve = useApprovePipelineStep();
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
    <button type="button" onClick={() => approve.mutate({ pipelineId, stepId })} disabled={!hasPlan || reviewedContent !== data?.content || approve.isPending}
      className="rounded bg-emerald-800 px-3 py-1 text-xs text-emerald-200 disabled:opacity-50">{approve.isPending ? "Approving..." : "Approve plan"}</button>
  </section>;
}

interface PipelineDetailProps {
  pipelineId: string;
  projectId?: string;
}

export function PipelineDetail({ pipelineId, projectId }: PipelineDetailProps) {
  const { data, isLoading, refetch } = usePipeline(pipelineId);
  const { data: repositoryDiff, isLoading: diffLoading, isError: diffError, refetch: refreshDiff } = usePipelineDiff(pipelineId);
  const cancelMutation = useCancelPipeline();
  const retryMutation = useRetryPipeline();
  const rejectMutation = useRejectPipelineStep();
  const approveMutation = useApprovePipelineStep();
  const publishMutation = usePublishPipelinePr();
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [rejectingStepId, setRejectingStepId] = useState<string | null>(null);
  const [targetStepId, setTargetStepId] = useState("");
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    if (data?.pipeline.status === "completed" || data?.pipeline.status === "cancelled") return;
    const timer = setInterval(() => { void refetch(); }, 5000);
    return () => clearInterval(timer);
  }, [data?.pipeline.status, pipelineId, refetch]);

  if (isLoading || !data) {
    return <p className="text-sm text-zinc-600">Loading pipeline...</p>;
  }

  const { pipeline, steps } = data;
  const implement = steps.find(step => step.label.toLowerCase() === "implement");
  const review = steps.find(step => ["review", "independent review"].includes(step.label.toLowerCase()));
  const outputPaths = new Set(steps.map(step => step.outputFilePath).filter(Boolean));
  const canPublish = pipeline.status === "completed" && steps.every(step => step.status === "completed") &&
    !!implement?.agentId && !!review?.agentId && !!review.requiresVerification && implement.agentId !== review.agentId &&
    review.order > implement.order && review.order === steps.length &&
    !!review.outputSummary?.trim() && !review.outputSummary.startsWith("[REJECTED]") &&
    repositoryDiff?.available && repositoryDiff.branch && repositoryDiff.branch !== repositoryDiff.baseBranch &&
    repositoryDiff.prLookup === "none" && !!repositoryDiff.committedDiff &&
    !repositoryDiff.workingDiff && !repositoryDiff.untrackedFiles?.some(path => !outputPaths.has(path)) && !repositoryDiff.untrackedMore;

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

      <PipelineStepper steps={steps} currentStep={pipeline.currentStep} />

      <section aria-label="Repository changes" className="rounded border border-zinc-800 p-3 space-y-2">
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
        {repositoryDiff?.available && <div className="space-y-4">
          <div className="rounded border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-300 space-y-1">
            <p>Checked-out branch: <span className="font-mono">{repositoryDiff.branch ?? "detached HEAD"}</span></p>
            {repositoryDiff.pullRequest ? <p>
              GitHub PR for this exact branch commit: <a className="text-blue-300 underline" href={repositoryDiff.pullRequest.url} target="_blank" rel="noopener noreferrer">
                #{repositoryDiff.pullRequest.number} {repositoryDiff.pullRequest.title}
              </a> ({repositoryDiff.pullRequest.state.toLowerCase()})
            </p> : repositoryDiff.prLookup === "none" ? <p>No GitHub PR found for this branch commit and configured base. Uncommitted changes are not part of a PR.</p>
              : repositoryDiff.prLookup === "unavailable" ? <p>PR lookup unavailable. Check GitHub authentication and the repository origin.</p>
                : <p>PR lookup applies to named branches other than the configured base.</p>}
            <p className="text-zinc-500">This is a repository-wide snapshot, not proof that the pipeline created the PR. Refresh to check again.</p>
          </div>
          {canPublish && <div className="rounded border border-blue-800/60 bg-blue-950/20 p-3 space-y-2 text-xs">
            <p className="text-zinc-300">Independent review completed. Create a draft PR from the current committed branch to {repositoryDiff.baseBranch}. Review the exact diff and tests on GitHub: this branch commit is not cryptographically tied to the pipeline review. This does not commit files, run checks, or merge.</p>
            {!confirmPublish ? <button type="button" onClick={() => setConfirmPublish(true)} className="rounded bg-blue-800 px-3 py-1 text-blue-100">Create pull request</button> : <div className="space-y-2">
              <p>Confirm: this publishes the committed branch {repositoryDiff.branch} to {repositoryDiff.baseBranch} on GitHub. Verify the review and diff first.</p>
              <button type="button" disabled={publishMutation.isPending} onClick={() => publishMutation.mutate(pipeline.id, { onSuccess: () => { setConfirmPublish(false); void refreshDiff(); } })} className="rounded bg-blue-800 px-3 py-1 text-blue-100 disabled:opacity-50">{publishMutation.isPending ? "Publishing..." : "Confirm create pull request"}</button>{" "}
              <button type="button" disabled={publishMutation.isPending} onClick={() => setConfirmPublish(false)} className="text-zinc-400 underline">Cancel</button>
            </div>}
          </div>}
          {publishMutation.isError && <p role="alert" className="text-amber-300 text-xs">{publishMutation.error instanceof Error ? publishMutation.error.message : "PR publication failed. Inspect GitHub before retrying."}</p>}
          {publishMutation.data && <p role="status" className="text-xs text-emerald-300">Pull request created: <a href={publishMutation.data.url} target="_blank" rel="noopener noreferrer" className="underline">{publishMutation.data.url}</a></p>}
          <div>
            <h5 className="text-xs font-medium text-zinc-300 mb-2">Committed changes since {repositoryDiff.baseBranch}</h5>
            <GitDiffViewer diff={repositoryDiff.committedDiff ?? ""} />
          </div>
          <div>
            <h5 className="text-xs font-medium text-zinc-300 mb-2">Staged and unstaged changes</h5>
            <GitDiffViewer diff={repositoryDiff.workingDiff ?? ""} />
          </div>
          <div>
            <h5 className="text-xs font-medium text-zinc-300 mb-1">Untracked files (names only)</h5>
            {repositoryDiff.untrackedFiles?.length ? <ul className="text-xs text-zinc-400 font-mono space-y-1">
              {repositoryDiff.untrackedFiles.map(path => <li key={path} className="break-all">{path}</li>)}
            </ul> : <p className="text-xs text-zinc-500">None found</p>}
            {repositoryDiff.untrackedMore && <p className="text-xs text-amber-300">More untracked files exist; only the first 20 names are shown.</p>}
          </div>
        </div>}
      </section>

      {/* Step details */}
      <div className="flex flex-col gap-[var(--gap-inline)]">
        {steps.map((step) => (
          <div key={step.id} className="rounded border border-zinc-800 p-3">
            <p className="text-sm font-medium text-zinc-200">{step.label} <span className="text-xs text-zinc-500">{step.status}</span></p>
            {step.taskId && <StepEvidence taskId={step.taskId} projectId={projectId ?? pipeline.projectId} stepStatus={step.status} />}
            {step.order === 1 && step.label.toLowerCase() === "plan" && step.status === "awaiting_verification" ?
              <PlanDecision key={`${step.id}:${step.updatedAt ?? ""}`} pipelineId={pipeline.id} stepId={step.id} revision={String(step.updatedAt ?? step.outputSummary ?? "")} outputFilePath={step.outputFilePath ?? null} /> :
              step.outputFilePath && (step.status === "completed" || step.status === "awaiting_verification") &&
              <StepOutput pipelineId={pipeline.id} stepId={step.id} label={step.label} revision={String(step.updatedAt ?? step.outputSummary ?? "")} />}
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
                  <button
                    onClick={() =>
                      approveMutation.mutate({ pipelineId: pipeline.id, stepId: step.id })
                    }
                    disabled={approveMutation.isPending}
                    className="rounded bg-emerald-800 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {approveMutation.isPending ? "Approving..." : "Approve"}
                  </button>
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
