// packages/dashboard/src/components/agent-editor/TemplateStep.tsx
import { useBundledAgents } from "../../hooks/useBundledAgents.js";
import type { BundledAgent } from "@orch/shared";

interface TemplateStepSingleProps {
  mode?: "single";
  selected: string | null;
  onSelect: (agent: BundledAgent) => void;
}

interface TemplateStepMultiProps {
  mode: "multi";
  selected: string[];
  onToggle: (agentId: string) => void;
}

type TemplateStepProps = TemplateStepSingleProps | TemplateStepMultiProps;

export function TemplateStep(props: TemplateStepProps) {
  const { data: bundledAgents, isLoading } = useBundledAgents();

  if (isLoading) {
    return (
      <div className="py-8 text-center text-sm text-zinc-500">
        Loading agent templates...
      </div>
    );
  }

  if (!bundledAgents || bundledAgents.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-zinc-500">
        No agent templates available.
      </div>
    );
  }

  const isMulti = props.mode === "multi";

  function isSelected(id: string): boolean {
    if (isMulti) {
      return (props as TemplateStepMultiProps).selected.includes(id);
    }
    return (props as TemplateStepSingleProps).selected === id;
  }

  function handleClick(agent: BundledAgent) {
    if (isMulti) {
      (props as TemplateStepMultiProps).onToggle(agent.id);
    } else {
      (props as TemplateStepSingleProps).onSelect(agent);
    }
  }

  // Extract a short description from the first sentence of systemPrompt
  function getDescription(agent: BundledAgent): string {
    const firstSentence = agent.systemPrompt.split(/\.\s/)[0];
    return firstSentence.length > 120
      ? firstSentence.slice(0, 117) + "..."
      : firstSentence + ".";
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {bundledAgents.map((agent) => (
        <button
          key={agent.id}
          type="button"
          onClick={() => handleClick(agent)}
          className={`rounded-lg border p-4 text-left transition-colors ${
            isSelected(agent.id)
              ? "border-blue-500 bg-blue-950/30"
              : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
          }`}
        >
          <div className="flex items-center gap-2">
            <p className="font-medium text-zinc-100">{agent.name}</p>
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
              {agent.role}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{getDescription(agent)}</p>
          <div className="mt-2 flex gap-1.5">
            <span className="rounded bg-zinc-800/60 px-1.5 py-0.5 text-[10px] text-zinc-500">
              {agent.model.split("-").slice(1, 3).join("-")}
            </span>
            <span className="rounded bg-zinc-800/60 px-1.5 py-0.5 text-[10px] text-zinc-500">
              {agent.maxTurns} turns
            </span>
            {agent.heartbeatEnabled && (
              <span className="rounded bg-zinc-800/60 px-1.5 py-0.5 text-[10px] text-zinc-500">
                heartbeat {agent.heartbeatIntervalSec}s
              </span>
            )}
          </div>
          {isMulti && isSelected(agent.id) && (
            <div className="mt-2 text-xs font-medium text-blue-400">Selected</div>
          )}
        </button>
      ))}
      {!isMulti && (
        <button
          type="button"
          onClick={() =>
            (props as TemplateStepSingleProps).onSelect({
              id: "blank",
              name: "Blank Agent",
              role: "custom",
              model: "claude-sonnet-4-6",
              maxTurns: 25,
              skills: [],
              heartbeatEnabled: false,
              systemPrompt: "",
            })
          }
          className={`rounded-lg border p-4 text-left transition-colors ${
            (props as TemplateStepSingleProps).selected === "blank"
              ? "border-blue-500 bg-blue-950/30"
              : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
          }`}
        >
          <p className="font-medium text-zinc-100">Blank Agent</p>
          <p className="mt-1 text-xs text-zinc-500">Start from scratch with empty config.</p>
        </button>
      )}
    </div>
  );
}
