import { useState, useEffect } from "react";
import { FormField } from "../shared/FormField.js";
import type { Agent } from "../../types.js";
import type { UseMutationResult } from "@tanstack/react-query";
import { useProjectSkills, useSyncProjectSkills } from "../../hooks/useProjectSkills.js";

interface SkillsToolsTabProps {
  agent: Agent;
  projectId: string;
  updateAgent: UseMutationResult<any, any, any, any>;
}

const TRUST_BADGE: Record<string, { label: string; color: string }> = {
  markdown_only: { label: "Markdown", color: "bg-green-900 text-green-300" },
  assets: { label: "Assets", color: "bg-yellow-900 text-yellow-300" },
  scripts_executables: { label: "Scripts", color: "bg-red-900 text-red-300" },
};

const ORIGIN_BADGE: Record<string, { label: string; color: string }> = {
  global: { label: "Global", color: "bg-blue-900 text-blue-300" },
  local_path: { label: "Project", color: "bg-purple-900 text-purple-300" },
};

export function SkillsToolsTab({ agent, projectId, updateAgent }: SkillsToolsTabProps) {
  const [desiredSkills, setDesiredSkills] = useState<string[]>(agent.desiredSkills ?? []);
  const [mcpTools, setMcpTools] = useState<string[]>(agent.mcpTools ?? []);
  const [allowedTools, setAllowedTools] = useState<string[]>(agent.allowedTools ?? []);
  const [newMcpTool, setNewMcpTool] = useState("");
  const [newAllowedTool, setNewAllowedTool] = useState("");

  const { data: projectSkills, isLoading } = useProjectSkills(projectId);
  const syncMutation = useSyncProjectSkills(projectId);

  useEffect(() => {
    setDesiredSkills(agent.desiredSkills ?? []);
    setMcpTools(agent.mcpTools ?? []);
    setAllowedTools(agent.allowedTools ?? []);
  }, [agent]);

  function toggleSkill(slug: string) {
    setDesiredSkills((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  function handleSave() {
    updateAgent.mutate({
      agentId: agent.id,
      projectId,
      desiredSkills,
      mcpTools,
      allowedTools,
    });
  }

  function addItem(
    list: string[],
    setList: (v: string[]) => void,
    value: string,
    setInput: (v: string) => void,
  ) {
    if (!value.trim() || list.includes(value.trim())) return;
    setList([...list, value.trim()]);
    setInput("");
  }

  function removeItem(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.filter((item) => item !== value));
  }

  const inputClass =
    "rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:border-zinc-600 focus:outline-none";

  function renderList(
    label: string,
    description: string,
    items: string[],
    setItems: (v: string[]) => void,
    newItem: string,
    setNewItem: (v: string) => void,
    placeholder: string,
  ) {
    return (
      <FormField label={label} description={description}>
        <div className="flex flex-wrap gap-1">
          {items.map((item) => (
            <span key={item} className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
              {item}
              <button type="button" onClick={() => removeItem(items, setItems, item)} className="text-zinc-600 hover:text-red-400">
                x
              </button>
            </span>
          ))}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem(items, setItems, newItem, setNewItem))}
            placeholder={placeholder}
            className={inputClass}
          />
          <button type="button" onClick={() => addItem(items, setItems, newItem, setNewItem)} className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700">
            Add
          </button>
        </div>
      </FormField>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <FormField
        label="Project Skills"
        description="Select which skills this agent should use. Skills are managed at the project level."
      >
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
          >
            {syncMutation.isPending ? "Syncing..." : "Sync from Disk"}
          </button>
        </div>

        {isLoading ? (
          <p className="text-xs text-zinc-500">Loading skills...</p>
        ) : projectSkills && projectSkills.length > 0 ? (
          <div className="flex flex-col gap-1">
            {projectSkills.map((skill) => {
              const badge = TRUST_BADGE[skill.trustLevel] ?? TRUST_BADGE.markdown_only;
              return (
                <label key={skill.slug} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-zinc-800/50">
                  <input
                    type="checkbox"
                    checked={desiredSkills.includes(skill.slug)}
                    onChange={() => toggleSkill(skill.slug)}
                    className="rounded border-zinc-700"
                  />
                  <span className="text-sm text-zinc-200">{skill.name}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.color}`}>
                    {badge.label}
                  </span>
                  {(() => {
                    const origin = ORIGIN_BADGE[skill.sourceType] ?? ORIGIN_BADGE.local_path;
                    return (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${origin.color}`}>
                        {origin.label}
                      </span>
                    );
                  })()}
                  {skill.description && (
                    <span className="text-xs text-zinc-500">{skill.description}</span>
                  )}
                </label>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">No skills found. Click "Sync from Disk" to discover skills.</p>
        )}
      </FormField>

      {renderList("MCP Tools", "MCP tool identifiers this agent can use", mcpTools, setMcpTools, newMcpTool, setNewMcpTool, "tool-name")}
      {renderList("Allowed Tools", "Restrict which tools the agent can call", allowedTools, setAllowedTools, newAllowedTool, setNewAllowedTool, "Read, Write, Bash, ...")}

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
