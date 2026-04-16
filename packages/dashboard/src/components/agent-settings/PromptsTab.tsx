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

// NOTE: This tab is slated for replacement by InstructionsTab in Task 16.
// The agent prompt columns (systemPrompt/promptTemplate/bootstrapPromptTemplate/
// instructionsFilePath) were dropped from the schema by Tasks 3 and 4, so the
// former fields are no longer available. Until Task 16 replaces this tab, we
// render a placeholder so the build succeeds and the
// `useInstructionBundle` hook (removed in Task 13) is no longer referenced.
export function PromptsTab({ agent, projectId, updateAgent }: PromptsTabProps) {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [promptTemplate, setPromptTemplate] = useState("");
  const [bootstrapPromptTemplate, setBootstrapPromptTemplate] = useState("");

  useEffect(() => {
    // agent prompt fields removed from schema; see note above
    setSystemPrompt("");
    setPromptTemplate("");
    setBootstrapPromptTemplate("");
  }, [agent]);

  function handleSave() {
    updateAgent.mutate({
      agentId: agent.id,
      projectId,
    });
  }

  return (
    <div className="flex flex-col gap-[var(--gap-section)]">
      <FormField
        label="Instructions"
        description="Agent instructions are now managed on disk (AGENTS.md + heartbeat.md). This tab will be replaced by InstructionsTab."
      >
        <MarkdownEditor value={systemPrompt} onChange={setSystemPrompt} placeholder="(placeholder)" />
      </FormField>

      <button
        onClick={handleSave}
        disabled={updateAgent.isPending}
        className="self-start rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {updateAgent.isPending ? "Saving..." : "Save Changes"}
      </button>
      {/* Unused placeholder state vars kept for future wiring */}
      <input type="hidden" value={promptTemplate} onChange={(e) => setPromptTemplate(e.target.value)} />
      <input type="hidden" value={bootstrapPromptTemplate} onChange={(e) => setBootstrapPromptTemplate(e.target.value)} />
    </div>
  );
}
