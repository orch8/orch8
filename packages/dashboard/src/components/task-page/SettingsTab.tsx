import { useState, useEffect } from "react";
import { useUpdateTask } from "../../hooks/useTasks.js";
import { FormField } from "../shared/FormField.js";
import type { Task } from "../../types.js";

interface SettingsTabProps {
  task: Task;
}

export function SettingsTab({ task }: SettingsTabProps) {
  const updateTask = useUpdateTask();

  const [autoCommit, setAutoCommit] = useState(task.autoCommit);
  const [autoPr, setAutoPr] = useState(task.autoPr);
  const [finishStrategy, setFinishStrategy] = useState<string>(
    task.finishStrategy ?? "",
  );
  const [mcpTools, setMcpTools] = useState<string[]>(task.mcpTools ?? []);
  const [newTool, setNewTool] = useState("");

  useEffect(() => {
    setAutoCommit(task.autoCommit);
    setAutoPr(task.autoPr);
    setFinishStrategy(task.finishStrategy ?? "");
    setMcpTools(task.mcpTools ?? []);
  }, [task]);

  function handleSave() {
    updateTask.mutate({
      taskId: task.id,
      autoCommit,
      autoPr,
      finishStrategy: finishStrategy
        ? (finishStrategy as "pr" | "merge" | "none")
        : null,
      mcpTools,
    });
  }

  function addTool() {
    if (!newTool.trim() || mcpTools.includes(newTool.trim())) return;
    setMcpTools([...mcpTools, newTool.trim()]);
    setNewTool("");
  }

  const inputClass =
    "w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none";

  return (
    <div className="flex flex-col gap-[var(--gap-section)]">
      <h3 className="text-sm font-semibold text-zinc-300">Git Configuration</h3>

      <FormField label="Finish Strategy">
        <select
          value={finishStrategy}
          onChange={(e) => setFinishStrategy(e.target.value)}
          className={inputClass}
        >
          <option value="">Use project default</option>
          <option value="merge">Merge to default branch</option>
          <option value="pr">Open a pull request</option>
          <option value="none">Leave branch alone</option>
        </select>
      </FormField>

      <div className="flex gap-[var(--gap-section)]">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={autoCommit} onChange={(e) => setAutoCommit(e.target.checked)} className="rounded border-zinc-700" />
          Auto Commit
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={autoPr} onChange={(e) => setAutoPr(e.target.checked)} className="rounded border-zinc-700" />
          Auto PR
        </label>
      </div>

      <h3 className="mt-2 text-sm font-semibold text-zinc-300">MCP Tools</h3>
      <div className="flex flex-wrap gap-1">
        {mcpTools.map((tool) => (
          <span key={tool} className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
            {tool}
            <button type="button" onClick={() => setMcpTools(mcpTools.filter((t) => t !== tool))} className="text-zinc-600 hover:text-red-400">
              x
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={newTool}
          onChange={(e) => setNewTool(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTool())}
          placeholder="tool-name"
          className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
        />
        <button type="button" onClick={addTool} className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700">
          Add
        </button>
      </div>

      <button
        onClick={handleSave}
        disabled={updateTask.isPending}
        className="self-start rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {updateTask.isPending ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}
