import { useState } from "react";
import { useUpdateTask } from "../../hooks/useTasks.js";
import { PhaseProgress } from "../task-detail/PhaseProgress.js";
import { MarkdownEditor } from "../shared/MarkdownEditor.js";
import { FormField } from "../shared/FormField.js";
import type { Task } from "../../types.js";
import { useAgents } from "../../hooks/useAgents.js";

interface PhasesTabProps {
  task: Task;
  projectId: string;
}

const PHASES = ["research", "plan", "implement", "review"] as const;

export function PhasesTab({ task, projectId }: PhasesTabProps) {
  const updateTask = useUpdateTask();
  const { data: agents } = useAgents(projectId);

  const [researchPromptOverride, setResearchPromptOverride] = useState(
    (task as any).researchPromptOverride ?? "",
  );
  const [planPromptOverride, setPlanPromptOverride] = useState(
    (task as any).planPromptOverride ?? "",
  );
  const [implementPromptOverride, setImplementPromptOverride] = useState(
    (task as any).implementPromptOverride ?? "",
  );
  const [reviewPromptOverride, setReviewPromptOverride] = useState(
    (task as any).reviewPromptOverride ?? "",
  );

  if (task.taskType !== "complex") {
    return <p className="text-sm text-zinc-500">Phase progress is only available for complex tasks.</p>;
  }

  function handleSaveOverrides() {
    updateTask.mutate({
      taskId: task.id,
      researchPromptOverride: researchPromptOverride || null,
      planPromptOverride: planPromptOverride || null,
      implementPromptOverride: implementPromptOverride || null,
      reviewPromptOverride: reviewPromptOverride || null,
    } as any);
  }

  const phaseAgentMap: Record<string, { agentId: string | null; field: string }> = {
    research: { agentId: (task as any).researchAgentId, field: "researchAgentId" },
    plan: { agentId: (task as any).planAgentId, field: "planAgentId" },
    implement: { agentId: (task as any).implementAgentId, field: "implementAgentId" },
    review: { agentId: (task as any).reviewAgentId, field: "reviewAgentId" },
  };

  const phaseOutputMap: Record<string, string | null> = {
    research: task.researchOutput,
    plan: task.planOutput,
    implement: task.implementationOutput,
    review: task.reviewOutput,
  };

  const promptOverrides = [
    { phase: "Research", value: researchPromptOverride, set: setResearchPromptOverride },
    { phase: "Plan", value: planPromptOverride, set: setPlanPromptOverride },
    { phase: "Implement", value: implementPromptOverride, set: setImplementPromptOverride },
    { phase: "Review", value: reviewPromptOverride, set: setReviewPromptOverride },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PhaseProgress currentPhase={task.complexPhase} />

      {/* Phase agent overrides */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-zinc-300">Phase Agents</h3>
        <div className="grid grid-cols-2 gap-3">
          {PHASES.map((phase) => {
            const { agentId, field } = phaseAgentMap[phase];
            return (
              <div key={phase}>
                <span className="text-xs capitalize text-zinc-500">{phase} Agent</span>
                <select
                  value={agentId ?? ""}
                  onChange={(e) => updateTask.mutate({ taskId: task.id, [field]: e.target.value || null } as any)}
                  className="mt-1 w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
                >
                  <option value="">Default</option>
                  {agents?.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* Phase outputs */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-zinc-300">Phase Outputs</h3>
        {PHASES.map((phase) => {
          const output = phaseOutputMap[phase];
          if (!output) return null;
          return (
            <details key={phase} className="mb-2">
              <summary className="cursor-pointer text-sm capitalize text-zinc-400 hover:text-zinc-300">
                {phase} Output
              </summary>
              <pre className="mt-1 max-h-60 overflow-auto rounded bg-zinc-950 p-3 text-xs text-zinc-400">
                {output}
              </pre>
            </details>
          );
        })}
      </div>

      {/* Prompt overrides */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-zinc-300">Prompt Overrides</h3>
        {promptOverrides.map(({ phase, value, set }) => (
          <FormField key={phase} label={`${phase} Prompt Override`}>
            <MarkdownEditor value={value} onChange={set} placeholder={`Custom ${phase.toLowerCase()} prompt...`} />
          </FormField>
        ))}
        <button
          onClick={handleSaveOverrides}
          disabled={updateTask.isPending}
          className="mt-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {updateTask.isPending ? "Saving..." : "Save Prompt Overrides"}
        </button>
      </div>
    </div>
  );
}
