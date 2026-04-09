import { useState, useEffect } from "react";
import { FormField } from "../shared/FormField.js";
import { MarkdownEditor } from "../shared/MarkdownEditor.js";
import type { Agent } from "../../types.js";
import type { UseMutationResult } from "@tanstack/react-query";
import { useInstructionBundle, useBundleFiles, useBundleFileContent, useWriteBundleFile, useUpdateBundleMode } from "../../hooks/useInstructionBundle.js";

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

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const { data: bundle } = useInstructionBundle(agent.id, projectId);
  const { data: bundleFiles } = useBundleFiles(agent.id, projectId);
  const { data: fileData } = useBundleFileContent(agent.id, projectId, selectedFile);
  const writeFile = useWriteBundleFile(agent.id, projectId);
  const updateMode = useUpdateBundleMode(agent.id, projectId);

  useEffect(() => {
    if (fileData?.content != null) setEditContent(fileData.content);
  }, [fileData]);

  useEffect(() => {
    setSystemPrompt(agent.systemPrompt ?? "");
    setPromptTemplate(agent.promptTemplate ?? "");
    setBootstrapPromptTemplate(agent.bootstrapPromptTemplate ?? "");
    setInstructionsFilePath(agent.instructionsFilePath ?? "");
  }, [agent]);

  function handleSave() {
    updateAgent.mutate({
      agentId: agent.id,
      projectId,
      systemPrompt,
      promptTemplate,
      bootstrapPromptTemplate,
      instructionsFilePath: instructionsFilePath || null,
    });
  }

  const inputClass =
    "w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none";

  return (
    <div className="flex flex-col gap-[var(--gap-section)]">
      <FormField label="System Prompt" description="Base system prompt for all runs">
        <MarkdownEditor value={systemPrompt} onChange={setSystemPrompt} placeholder="Enter system prompt..." />
      </FormField>

      <FormField label="Prompt Template" description="Per-run prompt template. Supports variable interpolation: {{task}}, {{context}}">
        <MarkdownEditor value={promptTemplate} onChange={setPromptTemplate} placeholder="Enter prompt template..." />
      </FormField>

      <FormField label="Bootstrap Prompt Template" description="First-run-only prompt for initial setup">
        <MarkdownEditor value={bootstrapPromptTemplate} onChange={setBootstrapPromptTemplate} placeholder="Enter bootstrap prompt..." />
      </FormField>

      {/* Instructions Bundle */}
      <FormField label="Instructions Bundle" description="Manages agent instruction files">
        {bundle ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400">Mode:</span>
              <select
                value={bundle.mode}
                onChange={(e) => updateMode.mutate({ mode: e.target.value })}
                className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
              >
                <option value="managed">Managed</option>
                <option value="external">External</option>
              </select>
            </div>

            {bundleFiles && bundleFiles.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Files:</span>
                {bundleFiles.map((f: any) => (
                  <button
                    key={f.path}
                    onClick={() => setSelectedFile(f.path)}
                    className={`text-left text-xs px-2 py-1 rounded ${
                      selectedFile === f.path ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800"
                    }`}
                  >
                    {f.path} {f.path === bundle.entryFile && "(entry)"}
                  </button>
                ))}
              </div>
            )}

            {selectedFile && bundle.mode === "managed" && (
              <div className="flex flex-col gap-1">
                <MarkdownEditor value={editContent} onChange={setEditContent} />
                <button
                  onClick={() => writeFile.mutate({ path: selectedFile, content: editContent })}
                  disabled={writeFile.isPending}
                  className="self-start rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                >
                  {writeFile.isPending ? "Saving..." : "Save File"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <input
            value={instructionsFilePath}
            onChange={(e) => setInstructionsFilePath(e.target.value)}
            placeholder="/path/to/AGENTS.md"
            className={inputClass}
          />
        )}
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
