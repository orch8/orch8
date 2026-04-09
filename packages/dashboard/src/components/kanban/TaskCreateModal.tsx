import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCreateTask } from "../../hooks/useTasks.js";
import { useCreatePipeline } from "../../hooks/usePipelines.js";
import { usePipelineTemplates } from "../../hooks/usePipelineTemplates.js";
import { useAgents } from "../../hooks/useAgents.js";
import { FormField } from "../shared/FormField.js";
import { MarkdownEditor } from "../shared/MarkdownEditor.js";
import { Modal } from "../ui/Modal.js";

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
    <Modal open={open} onClose={onClose} title="Create Task">
      <form onSubmit={handleSubmit} className="flex flex-col gap-[var(--gap-block)]">
        <FormField label="Title" required>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="focus-ring rounded-sm border border-edge bg-surface px-3 py-2 type-body text-ink"
          />
        </FormField>

        {taskType !== "pipeline" && (
          <FormField label="Description">
            <MarkdownEditor value={description} onChange={setDescription} placeholder="Task details..." />
          </FormField>
        )}

        <div className="grid grid-cols-1 gap-[var(--gap-block)] sm:grid-cols-3">
          <FormField label="Type">
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as any)}
              className="focus-ring rounded-sm border border-edge bg-surface px-3 py-2 type-body text-ink"
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
                  className="focus-ring rounded-sm border border-edge bg-surface px-3 py-2 type-body text-ink"
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
                  className="focus-ring rounded-sm border border-edge bg-surface px-3 py-2 type-body text-ink"
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
          <div className="flex flex-col gap-[var(--gap-block)]">
            <FormField label="Template" required>
              {templates && templates.length > 0 ? (
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="focus-ring rounded-sm border border-edge bg-surface px-3 py-2 type-body text-ink"
                >
                  <option value="">Select a template...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              ) : (
                <p className="type-micro text-mute">
                  No pipeline templates yet.{" "}
                  <Link
                    to="/projects/$projectId/pipelines/templates"
                    params={{ projectId }}
                    className="text-blue underline decoration-blue/40 decoration-dotted underline-offset-2 hover:decoration-blue"
                  >
                    Create one
                  </Link>
                </p>
              )}
            </FormField>

            {selectedTemplate && (
              <div className="rounded-sm border border-edge-soft bg-surface-2 p-[var(--gap-block)]">
                <p className="mb-2 type-label text-whisper">STEPS</p>
                <div className="flex flex-wrap items-center gap-1">
                  {(selectedTemplate.steps as Array<{ label: string; defaultAgentId?: string }>).map(
                    (step, i, arr) => (
                      <span key={i} className="flex items-center gap-1">
                        <span className="rounded-sm bg-surface-3 px-2 py-0.5 type-label text-mute">
                          {step.label}
                        </span>
                        {i < arr.length - 1 && (
                          <span className="type-label text-whisper">&rarr;</span>
                        )}
                      </span>
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-[var(--gap-inline)]">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-sm px-4 py-2 type-ui text-mute hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              !title.trim() ||
              isPending ||
              (taskType === "pipeline" && !templateId)
            }
            className="focus-ring rounded-sm bg-accent px-4 py-2 type-ui text-canvas hover:bg-[color:var(--color-accent-hover)] disabled:opacity-40"
          >
            {isPending ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
