import { useState } from "react";
import { useUpdateTask, useTasks } from "../../hooks/useTasks.js";
import { MarkdownEditor } from "../shared/MarkdownEditor.js";
import { MarkdownRenderer } from "../shared/MarkdownRenderer.js";
import { TaskActions } from "../task-detail/TaskActions.js";
import { TaskSidebar } from "./TaskSidebar.js";
import { ActivityTab } from "./ActivityTab.js";
import { RunsTab } from "./RunsTab.js";
import { SettingsTab } from "./SettingsTab.js";
import type { Task } from "../../types.js";

const TABS = ["Activity", "Runs", "Settings"] as const;
type Tab = (typeof TABS)[number];

interface TaskPageProps {
  task: Task;
  projectId: string;
}

export function TaskPage({ task, projectId }: TaskPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Activity");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(task.description ?? "");
  const updateTask = useUpdateTask();
  const { data: allTasks } = useTasks(projectId);

  function saveTitle() {
    if (titleDraft !== task.title) {
      updateTask.mutate({ taskId: task.id, title: titleDraft });
    }
    setEditingTitle(false);
  }

  function saveDescription() {
    if (descriptionDraft !== (task.description ?? "")) {
      updateTask.mutate({ taskId: task.id, description: descriptionDraft });
    }
    setEditingDescription(false);
  }


  return (
    <div className="flex h-full gap-6">
      {/* Left panel */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
        {/* Editable title */}
        {editingTitle ? (
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveTitle();
              if (e.key === "Escape") { setTitleDraft(task.title); setEditingTitle(false); }
            }}
            autoFocus
            className="text-xl font-semibold text-zinc-100 bg-transparent border-b border-zinc-700 focus:border-blue-500 focus:outline-none"
          />
        ) : (
          <h1
            onClick={() => { setEditingTitle(true); setTitleDraft(task.title); }}
            className="cursor-pointer text-xl font-semibold text-zinc-100 hover:text-zinc-50"
          >
            {task.title}
          </h1>
        )}

        {/* Editable description */}
        {editingDescription ? (
          <div>
            <MarkdownEditor
              value={descriptionDraft}
              onChange={setDescriptionDraft}
              onSubmit={saveDescription}
              placeholder="Add a description..."
            />
            <div className="mt-2 flex gap-2">
              <button onClick={saveDescription} className="rounded bg-blue-600 px-3 py-1 text-xs text-white">
                Save
              </button>
              <button onClick={() => { setDescriptionDraft(task.description ?? ""); setEditingDescription(false); }} className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => { setEditingDescription(true); setDescriptionDraft(task.description ?? ""); }}
            className="cursor-pointer rounded p-2 hover:bg-zinc-800/50"
          >
            {task.description ? (
              <MarkdownRenderer content={task.description} />
            ) : (
              <p className="text-sm text-zinc-600">Click to add a description...</p>
            )}
          </div>
        )}

        {/* Task actions */}
        <TaskActions
          taskId={task.id}
          column={task.column}
          taskType={task.taskType}
          brainstormStatus={task.brainstormStatus}
        />

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-blue-500 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1">
          {activeTab === "Activity" && <ActivityTab taskId={task.id} projectId={projectId} />}
          {activeTab === "Runs" && <RunsTab taskId={task.id} projectId={projectId} />}
          {activeTab === "Settings" && <SettingsTab task={task} />}
        </div>

        {task.taskType === "brainstorm" && (
          <LegacyBrainstormTranscript transcript={task.brainstormTranscript} />
        )}
      </div>

      {/* Right sidebar */}
      <TaskSidebar task={task} projectId={projectId} allTasks={allTasks ?? []} />
    </div>
  );
}

interface LegacyBrainstormTranscriptProps {
  transcript: string | null | undefined;
}

function LegacyBrainstormTranscript({ transcript }: LegacyBrainstormTranscriptProps) {
  if (!transcript || transcript.trim().length === 0) return null;
  return (
    <section className="mt-6 rounded-md border border-zinc-800 bg-zinc-950 p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
        Legacy brainstorm transcript
      </h3>
      <p className="mb-3 text-[11px] text-zinc-500">
        This conversation predates the unified chat. New brainstorms happen in
        chat — see the “Chat” entry in the sidebar.
      </p>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-300">
        {transcript}
      </pre>
    </section>
  );
}
