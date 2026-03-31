import { useState, useEffect } from "react";
import { FormField } from "../shared/FormField.js";
import { MarkdownEditor } from "../shared/MarkdownEditor.js";
import type { Agent } from "../../types.js";
import type { UseMutationResult } from "@tanstack/react-query";

interface PromptsTabProps {
  agent: Agent;
  projectId: string;
  updateAgent: UseMutationResult<any, any, any, any>;
}

export function PromptsTab({ agent, projectId, updateAgent }: PromptsTabProps) {
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt ?? "");
  const [promptTemplate, setPromptTemplate] = useState(agent.promptTemplate ?? "");
  const [bootstrapPromptTemplate, setBootstrapPromptTemplate] = useState(
    agent.bootstrapPromptTemplate ?? "",
  );
  const [instructionsFilePath, setInstructionsFilePath] = useState(
    agent.instructionsFilePath ?? "",
  );
  const [researchPrompt, setResearchPrompt] = useState(agent.researchPrompt ?? "");
  const [planPrompt, setPlanPrompt] = useState(agent.planPrompt ?? "");
  const [implementPrompt, setImplementPrompt] = useState(agent.implementPrompt ?? "");
  const [reviewPrompt, setReviewPrompt] = useState(agent.reviewPrompt ?? "");

  useEffect(() => {
    setSystemPrompt(agent.systemPrompt ?? "");
    setPromptTemplate(agent.promptTemplate ?? "");
    setBootstrapPromptTemplate(agent.bootstrapPromptTemplate ?? "");
    setInstructionsFilePath(agent.instructionsFilePath ?? "");
    setResearchPrompt(agent.researchPrompt ?? "");
    setPlanPrompt(agent.planPrompt ?? "");
    setImplementPrompt(agent.implementPrompt ?? "");
    setReviewPrompt(agent.reviewPrompt ?? "");
  }, [agent]);

  function handleSave() {
    updateAgent.mutate({
      agentId: agent.id,
      projectId,
      systemPrompt,
      promptTemplate,
      bootstrapPromptTemplate,
      instructionsFilePath: instructionsFilePath || null,
      researchPrompt,
      planPrompt,
      implementPrompt,
      reviewPrompt,
    });
  }

  const inputClass =
    "w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none";

  return (
    <div className="flex flex-col gap-5">
      <FormField label="System Prompt" description="Base system prompt for all runs">
        <MarkdownEditor value={systemPrompt} onChange={setSystemPrompt} placeholder="Enter system prompt..." />
      </FormField>

      <FormField label="Prompt Template" description="Per-run prompt template. Supports variable interpolation: {{task}}, {{context}}">
        <MarkdownEditor value={promptTemplate} onChange={setPromptTemplate} placeholder="Enter prompt template..." />
      </FormField>

      <FormField label="Bootstrap Prompt Template" description="First-run-only prompt for initial setup">
        <MarkdownEditor value={bootstrapPromptTemplate} onChange={setBootstrapPromptTemplate} placeholder="Enter bootstrap prompt..." />
      </FormField>

      <FormField label="Instructions File Path" description="Path to an instructions file on disk">
        <input value={instructionsFilePath} onChange={(e) => setInstructionsFilePath(e.target.value)} placeholder="/path/to/instructions.md" className={inputClass} />
      </FormField>

      <h3 className="mt-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">Phase Prompts</h3>

      <FormField label="Research Prompt">
        <MarkdownEditor value={researchPrompt} onChange={setResearchPrompt} placeholder="Research phase prompt..." />
      </FormField>

      <FormField label="Plan Prompt">
        <MarkdownEditor value={planPrompt} onChange={setPlanPrompt} placeholder="Plan phase prompt..." />
      </FormField>

      <FormField label="Implement Prompt">
        <MarkdownEditor value={implementPrompt} onChange={setImplementPrompt} placeholder="Implement phase prompt..." />
      </FormField>

      <FormField label="Review Prompt">
        <MarkdownEditor value={reviewPrompt} onChange={setReviewPrompt} placeholder="Review phase prompt..." />
      </FormField>

      <button
        onClick={handleSave}
        disabled={updateAgent.isPending}
        className="self-start rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {updateAgent.isPending ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}
