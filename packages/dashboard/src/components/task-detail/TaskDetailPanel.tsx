import { XIcon } from "lucide-react";
import { useTask, useTasks, useUpdateTask } from "../../hooks/useTasks.js";
import { useAgents } from "../../hooks/useAgents.js";
import { useTaskCost } from "../../hooks/useCost.js";
import { CommentThread } from "./CommentThread.js";
import { MarkdownRenderer } from "../shared/MarkdownRenderer.js";
import { ActivityTimeline } from "../shared/ActivityTimeline.js";
import { DependenciesSection } from "./DependenciesSection.js";
import { TaskActions } from "./TaskActions.js";
import { PipelineDetail } from "../pipeline/PipelineDetail.js";

interface TaskDetailPanelProps {
  taskId: string;
  projectId: string;
  onClose?: () => void;
}

export function TaskDetailPanel({ taskId, projectId, onClose }: TaskDetailPanelProps) {
  const { data: task, isLoading } = useTask(taskId);
  const { data: taskCost } = useTaskCost(taskId, projectId);
  const { data: allTasks } = useTasks(projectId);
  const { data: agents } = useAgents(projectId);
  const updateTask = useUpdateTask();

  if (isLoading) {
    return (
      <div className="w-96 shrink-0 rounded-lg border border-zinc-800 bg-zinc-900 p-[var(--gap-block)]">
        <p className="text-sm text-zinc-600">Loading...</p>
      </div>
    );
  }

  if (!task) return null;

  return (
    <div className="flex w-96 shrink-0 flex-col gap-[var(--gap-block)] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 p-[var(--gap-block)]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <h2 className="text-base font-semibold text-zinc-100">{task.title}</h2>
        <button
          onClick={() => onClose?.()}
          aria-label="Close panel"
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        >
          <XIcon className="size-4" />
        </button>
      </div>

      {/* Description */}
      {task.description && (
        <MarkdownRenderer content={task.description} />
      )}

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-zinc-600">Type</span>
          <p className="text-zinc-300">{task.taskType}</p>
        </div>
        <div>
          <span className="text-zinc-600">Column</span>
          <p className="text-zinc-300">{task.column}</p>
        </div>
        <div>
          <span className="text-zinc-600">Priority</span>
          <p className="text-zinc-300">{task.priority ?? "\u2014"}</p>
        </div>
        <div>
          <span className="text-zinc-600">Assignee</span>
          <select
            value={task.assignee ?? ""}
            onChange={(e) => {
              updateTask.mutate({
                taskId: task.id,
                assignee: e.target.value || null,
              });
            }}
            className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-300"
          >
            <option value="">Unassigned</option>
            {agents?.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Pipeline progress */}
      {task.pipelineId && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Pipeline Progress
          </h4>
          <PipelineDetail pipelineId={task.pipelineId} />
        </div>
      )}


      {/* Cost breakdown */}
      {taskCost && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Cost
          </h4>
          <p className="text-sm text-zinc-300">
            ${taskCost.total.toFixed(4)} total
          </p>
        </div>
      )}

      {/* Finish strategy */}
      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Finish Strategy
        </h4>
        <select
          value={task.finishStrategy ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            updateTask.mutate({
              taskId: task.id,
              finishStrategy: v ? (v as "pr" | "merge" | "none") : null,
            });
          }}
          className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-300"
        >
          <option value="">Use project default</option>
          <option value="merge">Merge to default branch</option>
          <option value="pr">Open a pull request</option>
          <option value="none">Leave branch alone</option>
        </select>
      </div>

      {/* Dependencies */}
      <DependenciesSection task={task} allTasks={allTasks ?? []} />

      {/* Actions */}
      <TaskActions
        taskId={task.id}
        column={task.column}
        taskType={task.taskType}
        brainstormStatus={task.brainstormStatus}
      />

      {/* Activity Timeline */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Activity
        </h4>
        <ActivityTimeline projectId={projectId} taskId={taskId} compact limit={5} />
      </div>

      {/* Comments */}
      <CommentThread taskId={taskId} projectId={projectId} />
    </div>
  );
}
