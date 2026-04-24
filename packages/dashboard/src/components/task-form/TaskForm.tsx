import { useState, useEffect, useMemo } from "react";
import { useAgents } from "../../hooks/useAgents.js";
import { useTasks } from "../../hooks/useTasks.js";
import { FormField } from "../shared/FormField.js";
import { MarkdownEditor } from "../shared/MarkdownEditor.js";
import { COLUMN_LABELS, type KanbanColumn } from "@orch/shared";

export type FinishStrategy = "pr" | "merge" | "none";

export interface TaskFormValues {
  title: string;
  description: string;
  taskType: "quick" | "brainstorm";
  priority: "low" | "medium" | "high";
  assignee: string;
  autoCommit: boolean;
  autoPr: boolean;
  finishStrategy: "" | FinishStrategy;
  mcpTools: string[];
  linkedIssueIds: string[];
  dependsOn: string[];
}

interface TaskFormProps {
  mode: "create" | "edit";
  projectId: string;
  initialValues: TaskFormValues;
  onSubmit: (values: TaskFormValues) => void | Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
  submitLabel?: string;
  excludeDependencyIds?: string[];
}

const INPUT_CLASS =
  "focus-ring rounded-sm border border-edge bg-surface px-3 py-2 type-body text-ink";
const SELECT_CLASS = INPUT_CLASS;
const CHIP_INPUT_CLASS =
  "rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100";

const STATUS_DOTS: Record<string, string> = {
  backlog: "bg-zinc-500",
  blocked: "bg-red-500",
  in_progress: "bg-blue-500",
  review: "bg-yellow-500",
  verification: "bg-purple-500",
  done: "bg-emerald-500",
};

export function emptyTaskFormValues(): TaskFormValues {
  return {
    title: "",
    description: "",
    taskType: "quick",
    priority: "medium",
    assignee: "",
    autoCommit: false,
    autoPr: true,
    finishStrategy: "",
    mcpTools: [],
    linkedIssueIds: [],
    dependsOn: [],
  };
}

export function TaskForm({
  mode,
  projectId,
  initialValues,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel,
  excludeDependencyIds,
}: TaskFormProps) {
  const { data: agents } = useAgents(projectId);
  const { data: allTasks } = useTasks(projectId);

  const [values, setValues] = useState<TaskFormValues>(initialValues);
  const [dependencyQuery, setDependencyQuery] = useState("");
  const [mcpToolDraft, setMcpToolDraft] = useState("");
  const [linkedIssueDraft, setLinkedIssueDraft] = useState("");

  // In edit mode, `initialValues` can change as the underlying task refetches.
  // In create mode, the caller passes a stable empty value — so resetting here
  // is harmless for create and essential for edit.
  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  function set<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const dependencyCandidates = useMemo(() => {
    if (!allTasks || !dependencyQuery.trim()) return [];
    const hidden = new Set<string>([
      ...values.dependsOn,
      ...(excludeDependencyIds ?? []),
    ]);
    const lowerQ = dependencyQuery.toLowerCase();
    return allTasks
      .filter(
        (t) =>
          !hidden.has(t.id) &&
          (t.title.toLowerCase().includes(lowerQ) ||
            t.id.toLowerCase().includes(lowerQ)),
      )
      .slice(0, 10);
  }, [allTasks, dependencyQuery, values.dependsOn, excludeDependencyIds]);

  const dependencyLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of allTasks ?? []) map.set(t.id, t.title);
    return map;
  }, [allTasks]);

  function addMcpTool() {
    const next = mcpToolDraft.trim();
    if (!next || values.mcpTools.includes(next)) return;
    set("mcpTools", [...values.mcpTools, next]);
    setMcpToolDraft("");
  }

  function addLinkedIssue() {
    const next = linkedIssueDraft.trim();
    if (!next || values.linkedIssueIds.includes(next)) return;
    set("linkedIssueIds", [...values.linkedIssueIds, next]);
    setLinkedIssueDraft("");
  }

  function addDependency(id: string) {
    if (values.dependsOn.includes(id)) return;
    set("dependsOn", [...values.dependsOn, id]);
    setDependencyQuery("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit(values);
  }

  const isCreate = mode === "create";
  const submitDisabled = !values.title.trim() || isSubmitting;
  const effectiveSubmitLabel =
    submitLabel ?? (isCreate ? "Create task" : "Save changes");

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-[var(--gap-section)]"
    >
      {/* Basics */}
      <section className="flex flex-col gap-[var(--gap-block)]">
        <FormField label="Title" required>
          <input
            value={values.title}
            onChange={(e) => set("title", e.target.value)}
            required
            autoFocus={isCreate}
            className={INPUT_CLASS}
          />
        </FormField>

        <FormField label="Description">
          <MarkdownEditor
            value={values.description}
            onChange={(v) => set("description", v)}
            placeholder="Task details..."
          />
        </FormField>

        <div className="grid grid-cols-1 gap-[var(--gap-block)] sm:grid-cols-3">
          <FormField label="Type">
            <select
              value={values.taskType}
              onChange={(e) =>
                set("taskType", e.target.value as "quick" | "brainstorm")
              }
              disabled={!isCreate}
              className={SELECT_CLASS}
            >
              <option value="quick">Quick</option>
              <option value="brainstorm">Brainstorm</option>
            </select>
          </FormField>
          <FormField label="Priority">
            <select
              value={values.priority}
              onChange={(e) =>
                set("priority", e.target.value as TaskFormValues["priority"])
              }
              className={SELECT_CLASS}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </FormField>
          <FormField label="Assignee">
            <select
              value={values.assignee}
              onChange={(e) => set("assignee", e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">Unassigned</option>
              {agents?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </section>

      {/* Git configuration */}
      <section className="flex flex-col gap-[var(--gap-block)]">
        <h3 className="type-label text-whisper">GIT</h3>
        <FormField label="Finish strategy">
          <select
            value={values.finishStrategy}
            onChange={(e) =>
              set(
                "finishStrategy",
                e.target.value as TaskFormValues["finishStrategy"],
              )
            }
            className={SELECT_CLASS}
          >
            <option value="">Use project default</option>
            <option value="merge">Merge to default branch</option>
            <option value="pr">Open a pull request</option>
            <option value="none">Leave branch alone</option>
          </select>
        </FormField>
        <div className="flex flex-wrap gap-[var(--gap-section)]">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={values.autoCommit}
              onChange={(e) => set("autoCommit", e.target.checked)}
              className="rounded border-zinc-700"
            />
            Auto commit
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={values.autoPr}
              onChange={(e) => set("autoPr", e.target.checked)}
              className="rounded border-zinc-700"
            />
            Auto PR
          </label>
        </div>
      </section>

      {/* MCP tools */}
      <section className="flex flex-col gap-[var(--gap-block)]">
        <h3 className="type-label text-whisper">MCP TOOLS</h3>
        {values.mcpTools.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {values.mcpTools.map((tool) => (
              <span
                key={tool}
                className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300"
              >
                {tool}
                <button
                  type="button"
                  onClick={() =>
                    set(
                      "mcpTools",
                      values.mcpTools.filter((t) => t !== tool),
                    )
                  }
                  className="text-zinc-500 hover:text-red-400"
                  aria-label={`Remove ${tool}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            value={mcpToolDraft}
            onChange={(e) => setMcpToolDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addMcpTool();
              }
            }}
            placeholder="tool-name"
            className={CHIP_INPUT_CLASS}
          />
          <button
            type="button"
            onClick={addMcpTool}
            className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
          >
            Add
          </button>
        </div>
      </section>

      {/* Linked issues */}
      <section className="flex flex-col gap-[var(--gap-block)]">
        <h3 className="type-label text-whisper">LINKED ISSUES</h3>
        <p className="type-micro text-mute">
          Issue identifiers exposed to agents as <code>ORCH_LINKED_ISSUE_IDS</code>.
        </p>
        {values.linkedIssueIds.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {values.linkedIssueIds.map((id) => (
              <span
                key={id}
                className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300"
              >
                {id}
                <button
                  type="button"
                  onClick={() =>
                    set(
                      "linkedIssueIds",
                      values.linkedIssueIds.filter((x) => x !== id),
                    )
                  }
                  className="text-zinc-500 hover:text-red-400"
                  aria-label={`Remove ${id}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            value={linkedIssueDraft}
            onChange={(e) => setLinkedIssueDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLinkedIssue();
              }
            }}
            placeholder="e.g. LIN-123 or github#42"
            className={CHIP_INPUT_CLASS}
          />
          <button
            type="button"
            onClick={addLinkedIssue}
            className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
          >
            Add
          </button>
        </div>
      </section>

      {/* Dependencies — create mode only; edit mode uses live add/remove */}
      {/* endpoints which live on the task detail page. */}
      {isCreate && (
        <section className="flex flex-col gap-[var(--gap-block)]">
          <h3 className="type-label text-whisper">DEPENDENCIES</h3>
          <p className="type-micro text-mute">
            Tasks that must reach <em>done</em> before this one starts. A task
            created with unresolved dependencies lands in the <em>blocked</em>{" "}
            column automatically.
          </p>
          {values.dependsOn.length > 0 && (
            <div className="flex flex-col gap-1">
              {values.dependsOn.map((id) => (
                <div
                  key={id}
                  className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1"
                >
                  <span className="truncate text-sm text-zinc-300">
                    {dependencyLabels.get(id) ?? id}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      set(
                        "dependsOn",
                        values.dependsOn.filter((x) => x !== id),
                      )
                    }
                    className="text-xs text-zinc-500 hover:text-red-400"
                    aria-label={`Remove dependency ${id}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <input
              value={dependencyQuery}
              onChange={(e) => setDependencyQuery(e.target.value)}
              placeholder="Search tasks..."
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
            />
            {dependencyCandidates.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-900">
                {dependencyCandidates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => addDependency(t.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        STATUS_DOTS[t.column] ?? "bg-zinc-500"
                      }`}
                    />
                    <span className="truncate">{t.title}</span>
                    <span className="ml-auto shrink-0 text-xs text-zinc-600">
                      {COLUMN_LABELS[t.column as KanbanColumn] ?? t.column}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-[var(--gap-inline)]">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="focus-ring rounded-sm px-4 py-2 type-ui text-mute hover:text-ink"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitDisabled}
          className="focus-ring rounded-sm bg-accent px-4 py-2 type-ui text-canvas hover:bg-[color:var(--color-accent-hover)] disabled:opacity-40"
        >
          {isSubmitting
            ? isCreate
              ? "Creating..."
              : "Saving..."
            : effectiveSubmitLabel}
        </button>
      </div>
    </form>
  );
}
