import { createFileRoute, Link } from "@tanstack/react-router";
import { useProjects } from "../hooks/useProjects.js";
import { useUiStore } from "../stores/ui.js";

export function ProjectsPage() {
  const { data: projects, isLoading } = useProjects();
  const setActiveProject = useUiStore((s) => s.setActiveProject);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Projects</h2>
        <Link
          to="/projects/new"
          className="rounded-md bg-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:bg-zinc-600"
        >
          + New Project
        </Link>
      </div>

      {isLoading && <p className="text-sm text-zinc-600">Loading projects...</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects?.map((project) => (
          <button
            key={project.id}
            onClick={() => setActiveProject(project.id)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-left transition-colors hover:border-zinc-700"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-zinc-100">{project.name}</h3>
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                  project.active
                    ? "bg-emerald-900/50 text-emerald-300"
                    : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {project.active ? "Active" : "Archived"}
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">{project.homeDir}</p>
            {project.budgetLimitUsd != null && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>Budget</span>
                  <span>
                    ${(project.budgetSpentUsd ?? 0).toFixed(2)} / ${project.budgetLimitUsd.toFixed(2)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-600"
                    style={{
                      width: `${Math.min(100, ((project.budgetSpentUsd ?? 0) / project.budgetLimitUsd) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
            <div className="mt-3 flex gap-3 text-xs text-zinc-600">
              <Link
                to="/projects/$id/settings"
                params={{ id: project.id }}
                className="text-blue-400 hover:text-blue-300"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              >
                Settings
              </Link>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/projects/")({
  component: ProjectsPage,
});
