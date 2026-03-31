import { useProjects } from "../../hooks/useProjects.js";
import { useUiStore } from "../../stores/ui.js";

export function ProjectSwitcher() {
  const { data: projects, isLoading } = useProjects();
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const setActiveProject = useUiStore((s) => s.setActiveProject);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Projects
        </span>
        <a
          href="/projects/new"
          className="rounded p-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-400"
          title="Create project"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </a>
      </div>

      <button
        onClick={() => setActiveProject(null)}
        className={`rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
          activeProjectId === null
            ? "bg-zinc-800 text-zinc-100"
            : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
        }`}
      >
        All Projects
      </button>

      {isLoading && (
        <span className="px-2 text-xs text-zinc-600">Loading...</span>
      )}

      {projects?.map((project) => (
        <button
          key={project.id}
          onClick={() => setActiveProject(project.id)}
          className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
            activeProjectId === project.id
              ? "bg-zinc-800 text-zinc-100"
              : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          }`}
        >
          <span>{project.name}</span>
          {!project.active && (
            <span className="text-xs text-zinc-600">archived</span>
          )}
        </button>
      ))}
    </div>
  );
}
