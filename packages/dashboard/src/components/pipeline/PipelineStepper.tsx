import type { PipelineStep } from "../../types.js";

interface PipelineStepperProps {
  steps: PipelineStep[];
  currentStep: number;
}

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-emerald-900/50 text-emerald-300 line-through",
  running: "bg-blue-900/50 text-blue-300",
  pending: "bg-zinc-900 text-zinc-600",
  skipped: "bg-zinc-900 text-zinc-700 line-through italic",
  failed: "bg-red-900/50 text-red-300",
  awaiting_verification: "bg-amber-900/50 text-amber-300",
};

const CONNECTOR_STYLES: Record<string, string> = {
  completed: "bg-emerald-600",
  running: "bg-blue-600",
  pending: "bg-zinc-700",
  skipped: "bg-zinc-700",
  failed: "bg-red-600",
  awaiting_verification: "bg-amber-600",
};

export function PipelineStepper({ steps, currentStep }: PipelineStepperProps) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center gap-1">
          {i > 0 && (
            <div
              className={`h-px w-4 ${CONNECTOR_STYLES[step.status] ?? CONNECTOR_STYLES.pending}`}
            />
          )}
          <span
            data-status={step.status}
            title={`Step ${step.order}: ${step.label} (${step.status})`}
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              STATUS_STYLES[step.status] ?? STATUS_STYLES.pending
            }`}
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}
