import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCreateTask } from "../../hooks/useTasks.js";
import { useCreatePipeline } from "../../hooks/usePipelines.js";
import { usePipelineTemplates } from "../../hooks/usePipelineTemplates.js";
import { useAgents } from "../../hooks/useAgents.js";
import { FormField } from "../shared/FormField.js";
import { MarkdownEditor } from "../shared/MarkdownEditor.js";

interface TaskCreateModalProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
}

export function TaskCreateModal({ projectId, open, onClose }: TaskCreateModalProps) {
  const createTask = useCreateTask();
  const createPipeline = useCreatePipeline();
  const { data: agents } = useAgents(projectId);
  const { data: templates } = usePipelineTemplates(projectId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<"quick" | "pipeline" | "brainstorm">("quick");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [assignee, setAssignee] = useState("");
  const [templateId, setTemplateId] = useState("");

  if (!open) return null;

  const selectedTemplate = templates?.find((t) => t.id === templateId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (taskType === "pipeline") {
      if (!templateId) return;
      await createPipeline.mutateAsync({
        projectId,
        name: title,
        templateId,
      });
    } else {
      await createTask.mutateAsync({
        projectId,
        title,
        description,
        taskType,
        priority,
        assignee: assignee || undefined,
      } as any);
    }

    setTitle("");
    setDescription("");
    setTaskType("quick");
    setPriority("medium");
    setAssignee("");
    setTemplateId("");
    onClose();
  }

  const isPending = createTask.isPending || createPipeline.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-lg border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-zinc-100">Create Task</h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Title" required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
            />
          </FormField>

          {taskType !== "pipeline" && (
            <FormField label="Description">
              <MarkdownEditor value={description} onChange={setDescription} placeholder="Task details..." />
            </FormField>
          )}

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Type">
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as any)}
                className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="quick">Quick</option>
                <option value="pipeline">Pipeline</option>
                <option value="brainstorm">Brainstorm</option>
              </select>
            </FormField>
            {taskType !== "pipeline" && (
              <>
                <FormField label="Priority">
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </FormField>
                <FormField label="Assignee">
                  <select
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    aria-label="Filter by assignee"
                    className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                  >
                    <option value="">Unassigned</option>
                    {agents?.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </FormField>
              </>
            )}
          </div>

          {taskType === "pipeline" && (
            <div className="space-y-3">
              <FormField label="Template" required>
                {templates && templates.length > 0 ? (
                  <select
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                  >
                    <option value="">Select a template...</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-zinc-500">
                    No pipeline templates yet.{" "}
                    <Link
                      to="/projects/$projectId/pipelines/templates"
                      params={{ projectId }}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      Create one
                    </Link>
                  </p>
                )}
              </FormField>

              {selectedTemplate && (
                <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
                  <p className="mb-2 text-xs font-medium text-zinc-400">Steps:</p>
                  <div className="flex flex-wrap items-center gap-1">
                    {(selectedTemplate.steps as Array<{ label: string; defaultAgentId?: string }>).map(
                      (step, i, arr) => (
                        <span key={i} className="flex items-center gap-1">
                          <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                            {step.label}
                          </span>
                          {i < arr.length - 1 && (
                            <span className="text-xs text-zinc-600">&rarr;</span>
                          )}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                !title.trim() ||
                isPending ||
                (taskType === "pipeline" && !templateId)
              }
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {isPending ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
