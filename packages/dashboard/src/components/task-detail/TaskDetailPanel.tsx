import { useTask, useTasks } from "../../hooks/useTasks.js";
import { useUiStore } from "../../stores/ui.js";
import { useTaskCost, usePhaseCost } from "../../hooks/useCost.js";
import { PhaseProgress } from "./PhaseProgress.js";
import { CommentThread } from "./CommentThread.js";
import { MarkdownRenderer } from "../shared/MarkdownRenderer.js";
import { ActivityTimeline } from "../shared/ActivityTimeline.js";
import { DependenciesSection } from "./DependenciesSection.js";
import { TaskActions } from "./TaskActions.js";

interface TaskDetailPanelProps {
  taskId: string;
}

export function TaskDetailPanel({ taskId }: TaskDetailPanelProps) {
  const { data: task, isLoading } = useTask(taskId);
  const selectTask = useUiStore((s) => s.selectTask);
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const { data: taskCost } = useTaskCost(taskId, task?.projectId ?? activeProjectId);
  const { data: phaseCost } = usePhaseCost(
    task?.taskType === "complex" ? taskId : null,
    task?.projectId ?? activeProjectId,
  );
  const { data: allTasks } = useTasks(task?.projectId ?? activeProjectId);

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
          onClick={() => selectTask(null)}
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
          <p className="text-zinc-300">{task.assignee ?? "Unassigned"}</p>
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

      {/* Verification result */}
      {task.verificationResult && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Verification
          </h4>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              task.verificationResult === "pass"
                ? "bg-emerald-900/50 text-emerald-300"
                : task.verificationResult === "fail"
                  ? "bg-red-900/50 text-red-300"
                  : "bg-yellow-900/50 text-yellow-300"
            }`}
          >
            {task.verificationResult}
          </span>
          {task.verifierReport && (
            <pre className="mt-2 max-h-40 overflow-auto rounded bg-zinc-950 p-2 text-xs text-zinc-400">
              {task.verifierReport}
            </pre>
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
      {activeProjectId && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Activity
          </h4>
          <ActivityTimeline projectId={activeProjectId} taskId={taskId} compact limit={5} />
        </div>
      )}

      {/* Comments */}
      <CommentThread taskId={taskId} />
    </div>
  );
}
