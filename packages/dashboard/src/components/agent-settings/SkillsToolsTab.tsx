import { useState, useEffect } from "react";
import { FormField } from "../shared/FormField.js";
import type { Agent } from "../../types.js";
import type { UseMutationResult } from "@tanstack/react-query";

interface SkillsToolsTabProps {
  agent: Agent;
  projectId: string;
  updateAgent: UseMutationResult<any, any, any, any>;
}

export function SkillsToolsTab({ agent, projectId, updateAgent }: SkillsToolsTabProps) {
  const [skillPaths, setSkillPaths] = useState<string[]>(agent.skillPaths ?? []);
  const [mcpTools, setMcpTools] = useState<string[]>(agent.mcpTools ?? []);
  const [allowedTools, setAllowedTools] = useState<string[]>(agent.allowedTools ?? []);
  const [newSkillPath, setNewSkillPath] = useState("");
  const [newMcpTool, setNewMcpTool] = useState("");
  const [newAllowedTool, setNewAllowedTool] = useState("");

  useEffect(() => {
    setSkillPaths(agent.skillPaths ?? []);
    setMcpTools(agent.mcpTools ?? []);
    setAllowedTools(agent.allowedTools ?? []);
  }, [agent]);

  function handleSave() {
    updateAgent.mutate({
      agentId: agent.id,
      projectId,
      skillPaths,
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
      {renderList("Skill Paths", "File paths to skill definitions", skillPaths, setSkillPaths, newSkillPath, setNewSkillPath, "/path/to/skill.md")}
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
