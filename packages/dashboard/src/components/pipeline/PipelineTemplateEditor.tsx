import { useState, useEffect } from "react";
import {
  useCreatePipelineTemplate,
  useUpdatePipelineTemplate,
} from "../../hooks/usePipelineTemplates.js";
import { useAgents } from "../../hooks/useAgents.js";
import { FormField } from "../shared/FormField.js";
import type { PipelineTemplate } from "../../types.js";

interface StepDef {
  order: number;
  label: string;
  defaultAgentId?: string;
  promptTemplate?: string;
}

interface PipelineTemplateEditorProps {
  projectId: string;
  template?: PipelineTemplate | null;
  onDone: () => void;
}

export function PipelineTemplateEditor({
  projectId,
  template,
  onDone,
}: PipelineTemplateEditorProps) {
  const createMutation = useCreatePipelineTemplate();
  const updateMutation = useUpdatePipelineTemplate();
  const { data: agents } = useAgents(projectId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [steps, setSteps] = useState<StepDef[]>([
    { order: 1, label: "", defaultAgentId: undefined, promptTemplate: "" },
  ]);

  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description ?? "");
      setIsDefault(template.isDefault ?? false);
      const tplSteps = template.steps as StepDef[];
      setSteps(
        tplSteps.length > 0
          ? tplSteps.map((s, i) => ({ ...s, order: i + 1 }))
          : [{ order: 1, label: "", defaultAgentId: undefined, promptTemplate: "" }],
      );
    }
  }, [template]);

  function addStep() {
    setSteps([...steps, { order: steps.length + 1, label: "", defaultAgentId: undefined, promptTemplate: "" }]);
  }

  function removeStep(index: number) {
    if (steps.length <= 1) return;
    const updated = steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 }));
    setSteps(updated);
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const updated = [...steps];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    setSteps(updated.map((s, i) => ({ ...s, order: i + 1 })));
  }

  function updateStep(index: number, field: keyof StepDef, value: string) {
    const updated = [...steps];
    if (field === "defaultAgentId") {
      updated[index] = { ...updated[index], defaultAgentId: value || undefined };
    } else if (field === "label" || field === "promptTemplate") {
      updated[index] = { ...updated[index], [field]: value };
    }
    setSteps(updated);
  }

  function handleSave() {
    const cleanSteps = steps.map((s, i) => ({
      order: i + 1,
      label: s.label,
      defaultAgentId: s.defaultAgentId,
      promptTemplate: s.promptTemplate || undefined,
    }));

    if (template) {
      updateMutation.mutate(
        { id: template.id, name, description, isDefault, steps: cleanSteps },
        { onSuccess: onDone },
      );
    } else {
      createMutation.mutate(
        { projectId, name, description, isDefault, steps: cleanSteps },
        { onSuccess: onDone },
      );
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;
  const hasValidSteps = steps.every((s) => s.label.trim().length > 0);

  return (
    <div className="space-y-4 rounded border border-zinc-700 bg-zinc-800/50 p-4">
      <h4 className="text-sm font-semibold text-zinc-200">
        {template ? "Edit Template" : "New Template"}
      </h4>

      <FormField label="Name" required>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name"
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
        />
      </FormField>

      <FormField label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description..."
          rows={2}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
        />
      </FormField>

      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="rounded border-zinc-600"
        />
        Default template
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-400">Steps</span>
          <button
            onClick={addStep}
            className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800"
          >
            + Add Step
          </button>
        </div>

        {steps.map((step, i) => (
          <div key={i} className="flex gap-2 rounded border border-zinc-800 bg-zinc-900/50 p-2">
            <div className="flex flex-col gap-1">
              <button
                onClick={() => moveStep(i, -1)}
                disabled={i === 0}
                className="text-xs text-zinc-600 hover:text-zinc-300 disabled:opacity-30"
                title="Move up"
              >
                &uarr;
              </button>
              <button
                onClick={() => moveStep(i, 1)}
                disabled={i === steps.length - 1}
                className="text-xs text-zinc-600 hover:text-zinc-300 disabled:opacity-30"
                title="Move down"
              >
                &darr;
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-1.5">
              <div className="flex gap-2">
                <input
                  value={step.label}
                  onChange={(e) => updateStep(i, "label", e.target.value)}
                  placeholder="Step label"
                  className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
                />
                <select
                  value={step.defaultAgentId ?? ""}
                  onChange={(e) => updateStep(i, "defaultAgentId", e.target.value)}
                  className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
                >
                  <option value="">Any agent</option>
                  {agents?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                value={step.promptTemplate ?? ""}
                onChange={(e) => updateStep(i, "promptTemplate", e.target.value)}
                placeholder="Prompt template (supports {{pipeline.outputFilePath}} and {{pipeline.context}})"
                rows={2}
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-300"
              />
            </div>

            <button
              onClick={() => removeStep(i)}
              disabled={steps.length <= 1}
              className="self-start text-xs text-zinc-600 hover:text-red-400 disabled:opacity-30"
              title="Remove step"
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={!name.trim() || !hasValidSteps || isPending}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
        <button
          onClick={onDone}
          className="rounded border border-zinc-700 px-4 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
