import { useAddDependency, useRemoveDependency } from "../../hooks/useDependencies.js";
import { DependencyPicker } from "../shared/DependencyPicker.js";
import type { Task } from "../../types.js";

interface DependenciesSectionProps {
  task: Task;
  allTasks: Task[];
}

const STATUS_DOTS: Record<string, string> = {
  backlog: "bg-zinc-500",
  blocked: "bg-red-500",
  in_progress: "bg-blue-500",
  review: "bg-yellow-500",
  verification: "bg-purple-500",
  done: "bg-emerald-500",
};

export function DependenciesSection({ task, allTasks }: DependenciesSectionProps) {
  const addDep = useAddDependency();
  const removeDep = useRemoveDependency();

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Dependencies
      </h4>

      <div>
        <p className="mb-1 text-xs text-zinc-500">Add dependency</p>
        <DependencyPicker
          projectId={task.projectId}
          selectedIds={[]}
          excludeIds={[task.id]}
          onAdd={(depId) => addDep.mutate({ taskId: task.id, dependsOnId: depId })}
        />
      </div>
    </div>
  );
}
