import type { ReactNode } from "react";

export interface WizardStep {
  label: string;
  content: ReactNode;
}

interface WizardStepperProps {
  steps: WizardStep[];
  currentStep: number;
  onStepChange: (step: number) => void;
  onComplete?: () => void;
  completeLabel?: string;
}

export function WizardStepper({
  steps,
  currentStep,
  onStepChange,
  onComplete,
  completeLabel = "Complete",
}: WizardStepperProps) {
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  return (
    <div className="flex flex-col gap-[var(--gap-section)]">
      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        {steps.map((step, i) => (
          <div key={step.label} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  i < currentStep
                    ? "bg-emerald-600 text-white"
                    : i === currentStep
                      ? "bg-zinc-600 text-zinc-100"
                      : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {i < currentStep ? "✓" : i + 1}
              </span>
              <span
                className={`text-sm font-medium ${
                  i === currentStep
                    ? "text-zinc-100"
                    : i < currentStep
                      ? "text-zinc-400"
                      : "text-zinc-600"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`h-px w-8 ${
                  i < currentStep ? "bg-emerald-600" : "bg-zinc-800"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div>{steps[currentStep].content}</div>

      {/* Navigation */}
      <div className="flex justify-between">
        <div>
          {!isFirst && (
            <button
              type="button"
              onClick={() => onStepChange(currentStep - 1)}
              className="rounded-md px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              Back
            </button>
          )}
        </div>
        <div>
          {isLast ? (
            onComplete && (
              <button
                type="button"
                onClick={onComplete}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                {completeLabel}
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => onStepChange(currentStep + 1)}
              className="rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-600"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
