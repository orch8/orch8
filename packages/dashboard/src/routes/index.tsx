import { createFileRoute } from "@tanstack/react-router";
import { KanbanBoard } from "../components/kanban/KanbanBoard.js";
import { useUiStore } from "../stores/ui.js";
import { TaskDetailPanel } from "../components/task-detail/TaskDetailPanel.js";

function DashboardPage() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const selectedTaskId = useUiStore((s) => s.selectedTaskId);

  return (
    <div className="flex h-full gap-4">
      <div className="flex-1 overflow-auto">
        <KanbanBoard projectId={activeProjectId} />
      </div>
      {selectedTaskId && <TaskDetailPanel taskId={selectedTaskId} />}
    </div>
  );
}

export const Route = createFileRoute("/")({
  component: DashboardPage,
});
