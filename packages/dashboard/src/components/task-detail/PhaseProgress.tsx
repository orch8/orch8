const PHASES = ["research", "plan", "implement", "review"] as const;

interface PhaseProgressProps {
  currentPhase: string | null;
}

export function PhaseProgress({ currentPhase }: PhaseProgressProps) {
  const currentIndex = PHASES.indexOf(currentPhase as (typeof PHASES)[number]);

  return (
    <div className="flex items-center gap-1">
      {PHASES.map((phase, i) => {
        const isCompleted = currentIndex > i;
        const isActive = currentIndex === i;

        return (
          <div key={phase} className="flex items-center gap-1">
            {i > 0 && (
              <div
                className={`h-px w-4 ${isCompleted || isActive ? "bg-emerald-600" : "bg-zinc-700"}`}
              />
            )}
            <span
              data-active={isActive ? "true" : undefined}
              data-completed={isCompleted ? "true" : undefined}
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                isActive
                  ? "bg-emerald-900/50 text-emerald-300"
                  : isCompleted
                    ? "bg-zinc-800 text-zinc-400 line-through"
                    : "bg-zinc-900 text-zinc-600"
              }`}
            >
              {phase}
            </span>
          </div>
        );
      })}
    </div>
  );
}
