import { CommentThread } from "../task-detail/CommentThread.js";
import { ActivityTimeline } from "../shared/ActivityTimeline.js";

interface ActivityTabProps {
  taskId: string;
  projectId: string;
}

export function ActivityTab({ taskId, projectId }: ActivityTabProps) {
  return (
    <div className="flex flex-col gap-[var(--gap-section)]">
      <div>
        <h3 className="mb-3 text-sm font-semibold text-zinc-300">Timeline</h3>
        <ActivityTimeline projectId={projectId} taskId={taskId} />
      </div>

      <div>
        <CommentThread taskId={taskId} projectId={projectId} />
      </div>
    </div>
  );
}
