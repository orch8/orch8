import { useState } from "react";
import {
  usePipeline,
  useCancelPipeline,
  useRetryPipeline,
  useRejectPipelineStep,
  useApprovePipelineStep,
} from "../../hooks/usePipelines.js";
import { PipelineStepper } from "./PipelineStepper.js";

interface PipelineDetailProps {
  pipelineId: string;
}

export function PipelineDetail({ pipelineId }: PipelineDetailProps) {
  const { data, isLoading } = usePipeline(pipelineId);
  const cancelMutation = useCancelPipeline();
  const retryMutation = useRetryPipeline();
  const rejectMutation = useRejectPipelineStep();
  const approveMutation = useApprovePipelineStep();
  const [rejectingStepId, setRejectingStepId] = useState<string | null>(null);
  const [targetStepId, setTargetStepId] = useState("");
  const [feedback, setFeedback] = useState("");

  if (isLoading || !data) {
    return <p className="text-sm text-zinc-600">Loading pipeline...</p>;
  }

  const { pipeline, steps } = data;

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

      {/* Step details */}
      <div className="flex flex-col gap-[var(--gap-inline)]">
        {steps.map((step) => (
          <div key={step.id}>
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
            {step.status === "awaiting_verification" && (
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
