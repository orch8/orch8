import { useState } from "react";
import { useCancelPipeline, usePipeline, useRetryPipeline } from "../../hooks/usePipelines.js";
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
  return <p className={`px-4 pb-2 text-xs ${needsDecision ? "text-amber-300" : "text-zinc-400"}`}>
    {needsDecision ? `Your decision needed: inspect ${current.label.toLowerCase()} and ${decision} it or ${current.order > 1 ? "reject it" : "cancel the workflow"}.` :
      `${current.label}: ${current.status === "running" ? "step running" : "not completed"}. Open the workflow to inspect runs and logs.`}
  </p>;
}

export function PipelineList({ pipelines: items, showActions = false }: PipelineListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const cancelMutation = useCancelPipeline();
  const retryMutation = useRetryPipeline();

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
              {pipeline.status === "failed" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    retryMutation.mutate(pipeline.id);
                  }}
                  disabled={retryMutation.isPending}
                  className="text-xs text-amber-500 hover:text-amber-300"
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
