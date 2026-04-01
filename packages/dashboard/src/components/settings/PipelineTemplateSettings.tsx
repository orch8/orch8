import { useState } from "react";
import {
  usePipelineTemplates,
  useCreatePipelineTemplate,
  useDeletePipelineTemplate,
} from "../../hooks/usePipelineTemplates.js";

interface PipelineTemplateSettingsProps {
  projectId: string;
}

export function PipelineTemplateSettings({ projectId }: PipelineTemplateSettingsProps) {
  const { data: templates, isLoading } = usePipelineTemplates(projectId);
  const createMutation = useCreatePipelineTemplate();
  const deleteMutation = useDeletePipelineTemplate();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSteps, setNewSteps] = useState("research, plan, implement, review");

  const handleCreate = () => {
    const steps = newSteps.split(",").map((s, i) => ({
      order: i + 1,
      label: s.trim(),
    }));
    createMutation.mutate(
      { projectId, name: newName, steps },
      {
        onSuccess: () => {
          setShowCreate(false);
          setNewName("");
          setNewSteps("research, plan, implement, review");
        },
      },
    );
  };

  if (isLoading) return <p className="text-sm text-zinc-600">Loading...</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-200">Pipeline Templates</h4>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
        >
          {showCreate ? "Cancel" : "+ New Template"}
        </button>
      </div>

      {showCreate && (
        <div className="space-y-2 rounded border border-zinc-700 bg-zinc-800/50 p-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Template name"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-200"
          />
          <input
            value={newSteps}
            onChange={(e) => setNewSteps(e.target.value)}
            placeholder="Steps (comma-separated)"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-200"
          />
          <button
            onClick={handleCreate}
            disabled={!newName || createMutation.isPending}
            className="rounded bg-emerald-800 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-700 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      )}

      {templates?.length === 0 && (
        <p className="text-xs text-zinc-600">No templates yet. Create one to define reusable pipeline workflows.</p>
      )}

      {templates?.map((tpl) => (
        <div
          key={tpl.id}
          className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2"
        >
          <div>
            <p className="text-sm text-zinc-200">
              {tpl.name}
              {tpl.isDefault && (
                <span className="ml-2 rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-400">
                  default
                </span>
              )}
            </p>
            <p className="text-xs text-zinc-500">
              {(tpl.steps as Array<{ label: string }>).map((s) => s.label).join(" \u2192 ")}
            </p>
          </div>
          <button
            onClick={() => deleteMutation.mutate(tpl.id)}
            disabled={deleteMutation.isPending}
            className="text-xs text-zinc-600 hover:text-red-400"
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
