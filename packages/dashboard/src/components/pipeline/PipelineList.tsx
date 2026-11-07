import { useState } from "react";
import { useCancelPipeline, usePipeline, useRetryPipeline } from "../../hooks/usePipelines.js";
import { useRuns } from "../../hooks/useRuns.js";
import { PipelineDetail } from "./PipelineDetail.js";
import type { Pipeline, PipelineStep } from "../../types.js";

interface PipelineListProps {
  pipelines: Array<Pipeline & { steps?: PipelineStep[] }>;
  showActions?: boolean;
}

function WorkflowProgress({ pipeline }: { pipeline: Pipeline }) {
  const { data, isError } = usePipeline(pipeline.id, true);
  if (isError) return <p role="alert" className="px-4 pb-2 text-xs text-amber-300">Could not load the current step. Open the workflow for details.</p>;
  const current = data?.steps.find(step => step.status === "awaiting_verification") ??
    data?.steps.find(step => step.status === "running") ??
    data?.steps.find(step => step.status === "pending");
  if (!current) return <p className="px-4 pb-2 text-xs text-zinc-400">Checking workflow progress...</p>;
  const needsDecision = current.status === "awaiting_verification";
  const review = /\b(review|verification)\b/i.test(current.label);
  const decision = review ? "accept" : "approve";
  return <div className="px-4 pb-2 text-xs space-y-1">
    <p className={needsDecision ? "text-amber-300" : "text-zinc-400"}>
      {needsDecision ? `Your decision needed: inspect ${current.label.toLowerCase()} and ${decision} it or ${current.order > 1 ? "reject it" : "cancel the workflow"}.` :
        `${current.label}: ${current.status === "running" ? "step running" : "not completed"}. Open the workflow to inspect runs and logs.`}
    </p>
    {current.status === "pending" && current.taskId && current.agentId && <PendingStepRun taskId={current.taskId} projectId={pipeline.projectId} label={current.label} agentId={current.agentId} />}
  </div>;
}

function PendingStepRun({ taskId, projectId, label, agentId }: { taskId: string; projectId: string; label: string; agentId: string }) {
  const { data: runs, isError } = useRuns(projectId, { taskId, limit: 1 });
  if (isError) return <p className="text-amber-300">Could not check the latest {label.toLowerCase()} run. Open the workflow to inspect it.</p>;
  const run = runs?.[0];
  if (!run || run.agentId !== agentId || !["succeeded", "failed", "cancelled"].includes(run.status)) return null;
  return <p className="text-amber-300">
    Agent run ended ({run.status}), but {label.toLowerCase()} is still pending. The exit status does not finish this workflow.{" "}
    <a className="text-blue-300 underline" href={`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`}>Inspect the task and raw run log</a> before starting another run.
  </p>;
}

function FailedRun({ taskId, projectId }: { taskId: string; projectId: string }) {
  const { data: runs, isError } = useRuns(projectId, { taskId, limit: 1 });
  if (isError) return <p className="text-amber-300">Run details unavailable. Open the workflow to inspect the task.</p>;
  const run = runs?.[0];
  return <div className="space-y-1">
    {run ? <p>Most recent task run: {run.status}. {run.error ? <span className="whitespace-pre-wrap break-words text-red-300">{run.error}</span> : "No error message recorded."} The run status alone does not explain why the step failed; inspect the raw log before retrying.</p>
      : <p className="text-zinc-400">No run found for this task. Inspect the task before retrying.</p>}
    <a className="text-blue-300 underline" href={`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`}>Open failed task and run log</a>
  </div>;
}

function RetryFailedStep({ pipelineId }: { pipelineId: string }) {
  const retry = useRetryPipeline();
  return <>
    <button type="button" onClick={() => retry.mutate(pipelineId)} disabled={retry.isPending}
      className="text-xs text-amber-500 hover:text-amber-300">Retry failed step</button>
    {retry.isError && <p role="alert" className="text-xs text-red-300">Retry failed: {retry.error instanceof Error ? retry.error.message : "Open the workflow for details."}</p>}
  </>;
}

function FailedWorkflowProgress({ pipeline }: { pipeline: Pipeline }) {
  const { data, isError } = usePipeline(pipeline.id);
  const failed = data?.steps.find(step => step.status === "failed");
  return <div className="px-4 pb-3 text-xs space-y-1" role="status">
    <p className="text-red-300">{failed ? `${failed.label} failed. Inspect the run before retrying.` : "Workflow failed. Inspect the workflow before retrying."}</p>
    {isError && <p className="text-amber-300">Could not load the failed step. Open the workflow for details.</p>}
    {failed?.taskId && <FailedRun taskId={failed.taskId} projectId={pipeline.projectId} />}
  </div>;
}

export function PipelineList({ pipelines: items, showActions = false }: PipelineListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const cancelMutation = useCancelPipeline();

  if (items.length === 0) {
    return <p className="text-sm text-zinc-600">No pipelines found.</p>;
  }

  return (
    <div className="flex flex-col gap-[var(--gap-inline)]">
      {items.map((pipeline) => (
        <div
          key={pipeline.id}
          className="rounded border border-zinc-800 bg-zinc-900/50"
        >
          <button
            onClick={() => setExpandedId(expandedId === pipeline.id ? null : pipeline.id)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-zinc-200">{pipeline.name}</span>
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
            <span className="text-xs text-zinc-600">
              {new Date(pipeline.createdAt).toLocaleDateString()}
            </span>
          </button>
          {(pipeline.status === "pending" || pipeline.status === "running") && <WorkflowProgress pipeline={pipeline} />}
          {pipeline.status === "failed" && <FailedWorkflowProgress pipeline={pipeline} />}
          <div className="border-t border-zinc-800 px-4 py-2">
            <a href={`/projects/${encodeURIComponent(pipeline.projectId)}/pipelines/${encodeURIComponent(pipeline.id)}`} className="text-xs text-blue-300 underline">Open workflow and copy link</a>
          </div>

          {expandedId === pipeline.id && (
            <div className="border-t border-zinc-800 px-4 py-3">
              <PipelineDetail pipelineId={pipeline.id} />
            </div>
          )}

          {showActions && expandedId !== pipeline.id && (
            <div className="flex gap-2 border-t border-zinc-800 px-4 py-2">
              {(pipeline.status === "pending" || pipeline.status === "running") && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelMutation.mutate(pipeline.id);
                  }}
                  disabled={cancelMutation.isPending}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Cancel
                </button>
              )}
              {pipeline.status === "failed" && <RetryFailedStep pipelineId={pipeline.id} />}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
