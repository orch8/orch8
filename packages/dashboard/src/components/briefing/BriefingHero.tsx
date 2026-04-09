import { Pill } from "../ui/Pill.js";

interface BriefingHeroProps {
  projectName: string;
  agentsWorking: number;
  tasksInFlight: number;
  attentionCount: number;
  spend: string;
  budgetUsed: string;
  uptime: string;
  queueDepth: number;
}

export function BriefingHero({
  projectName,
  agentsWorking,
  tasksInFlight,
  attentionCount,
  spend,
  budgetUsed,
  uptime,
  queueDepth,
}: BriefingHeroProps) {
  return (
    <section
      className="mb-[var(--gap-section)] rounded-lg border border-edge-soft px-[var(--pad-page)] py-[var(--gap-section)]"
      style={{
        background:
          "linear-gradient(180deg, var(--color-hero-top) 0%, var(--color-hero-bot) 100%)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
        />
        <span className="type-label text-mute">LIVE · {projectName}</span>
      </div>
      <h1 className="mt-[var(--gap-block)] type-display text-ink">
        <span className="text-accent">{agentsWorking}</span>{" "}
        {agentsWorking === 1 ? "agent" : "agents"} working,{" "}
        <span className="text-accent">{tasksInFlight}</span>{" "}
        {tasksInFlight === 1 ? "task" : "tasks"} in flight.{" "}
        {attentionCount > 0 ? (
          <>
            <span className="text-accent">{attentionCount}</span>{" "}
            {attentionCount === 1 ? "thing wants" : "things want"} your attention.
          </>
        ) : (
          <>Nothing needs you right now.</>
        )}
      </h1>
      <div className="mt-[var(--gap-block)] flex flex-wrap gap-[var(--gap-inline)]">
        <Pill label="spend today" value={spend} />
        <Pill label="budget used" value={budgetUsed} />
        <Pill label="uptime" value={uptime} />
        <Pill label="queue" value={queueDepth} />
      </div>
    </section>
  );
}
