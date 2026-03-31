import { useState } from "react";
import { useCreateTask } from "../../hooks/useTasks.js";
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
  const { data: agents } = useAgents(projectId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<"quick" | "complex" | "brainstorm">("quick");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [assignee, setAssignee] = useState("");

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createTask.mutateAsync({
      projectId,
      title,
      description,
      taskType,
      priority,
      assignee: assignee || undefined,
    } as any);
    setTitle("");
    setDescription("");
    setTaskType("quick");
    setPriority("medium");
    setAssignee("");
    onClose();
  }

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

          <FormField label="Description">
            <MarkdownEditor value={description} onChange={setDescription} placeholder="Task details..." />
          </FormField>

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Type">
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as any)}
                className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="quick">Quick</option>
                <option value="complex">Complex</option>
                <option value="brainstorm">Brainstorm</option>
              </select>
            </FormField>
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
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || createTask.isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {createTask.isPending ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
