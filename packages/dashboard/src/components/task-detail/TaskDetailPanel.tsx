import { useTask, useTasks, useUpdateTask } from "../../hooks/useTasks.js";
import { useAgents } from "../../hooks/useAgents.js";
import { useTaskCost, usePhaseCost } from "../../hooks/useCost.js";
import { PhaseProgress } from "./PhaseProgress.js";
import { CommentThread } from "./CommentThread.js";
import { MarkdownRenderer } from "../shared/MarkdownRenderer.js";
import { ActivityTimeline } from "../shared/ActivityTimeline.js";
import { DependenciesSection } from "./DependenciesSection.js";
import { TaskActions } from "./TaskActions.js";

interface TaskDetailPanelProps {
  taskId: string;
  projectId: string;
  onClose?: () => void;
}

export function TaskDetailPanel({ taskId, projectId, onClose }: TaskDetailPanelProps) {
  const { data: task, isLoading } = useTask(taskId);
  const { data: taskCost } = useTaskCost(taskId, projectId);
  const { data: phaseCost } = usePhaseCost(
    task?.taskType === "complex" ? taskId : null,
    projectId,
  );
  const { data: allTasks } = useTasks(projectId);
  const { data: agents } = useAgents(projectId);
  const updateTask = useUpdateTask();

  if (isLoading) {
    return (
      <div className="w-96 shrink-0 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-sm text-zinc-600">Loading...</p>
      </div>
    );
  }

  if (!task) return null;

  return (
    <div className="flex w-96 shrink-0 flex-col gap-4 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <h2 className="text-base font-semibold text-zinc-100">{task.title}</h2>
        <button
          onClick={() => onClose?.()}
          aria-label="Close panel"
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
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

      {/* Phase progress for complex tasks */}
      {task.taskType === "complex" && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Phase Progress
          </h4>
          <PhaseProgress currentPhase={task.complexPhase} />

          {task.researchOutput && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
                Research Output
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-zinc-950 p-2 text-xs text-zinc-400">
                {task.researchOutput}
              </pre>
            </details>
          )}
          {task.planOutput && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
                Plan Output
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-zinc-950 p-2 text-xs text-zinc-400">
                {task.planOutput}
              </pre>
            </details>
          )}
          {task.implementationOutput && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
                Implementation Output
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-zinc-950 p-2 text-xs text-zinc-400">
                {task.implementationOutput}
              </pre>
            </details>
          )}
          {task.reviewOutput && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
                Review Output
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-zinc-950 p-2 text-xs text-zinc-400">
                {task.reviewOutput}
              </pre>
            </details>
          )}
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
          {phaseCost && phaseCost.byPhase.length > 0 && (
            <div className="mt-1 space-y-1">
              {phaseCost.byPhase.map((p) => (
                <div
                  key={p.phase}
                  className="flex justify-between text-xs text-zinc-500"
                >
                  <span>{p.phase}</span>
                  <span>${p.totalCost.toFixed(4)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Git info */}
      {task.branch && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Git
          </h4>
          <p className="font-mono text-xs text-zinc-400">{task.branch}</p>
        </div>
      )}

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
      <CommentThread taskId={taskId} />
    </div>
  );
}
