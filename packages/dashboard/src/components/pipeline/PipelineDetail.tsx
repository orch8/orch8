import { usePipeline, useCancelPipeline, useRetryPipeline } from "../../hooks/usePipelines.js";
import { PipelineStepper } from "./PipelineStepper.js";

interface PipelineDetailProps {
  pipelineId: string;
}

export function PipelineDetail({ pipelineId }: PipelineDetailProps) {
  const { data, isLoading } = usePipeline(pipelineId);
  const cancelMutation = useCancelPipeline();
  const retryMutation = useRetryPipeline();

  if (isLoading || !data) {
    return <p className="text-sm text-zinc-600">Loading pipeline...</p>;
  }

  const { pipeline, steps } = data;

  return (
    <div className="space-y-4">
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
      <div className="space-y-2">
        {steps.map((step) => (
          <div key={step.id}>
            {step.outputSummary && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
                  {step.label} output
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
