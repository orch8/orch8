import { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { useProjects } from "../../hooks/useProjects.js";

export function ProjectSwitcher() {
  const { data: projects, isLoading } = useProjects();
  const params = useParams({ strict: false }) as { projectId?: string };
  const currentProjectId = params.projectId;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentProject = projects?.find((p) => p.id === currentProjectId);

  // Close popover on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function switchProject(newProjectId: string) {
    // Preserve current page when switching projects
    const currentSuffix = currentProjectId
      ? pathname.replace(`/projects/${currentProjectId}`, "")
      : "";
    const target = `/projects/${newProjectId}${currentSuffix || ""}`;
    navigate({ to: target });
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium text-zinc-200 hover:bg-zinc-900"
      >
        <span className="truncate">
          {isLoading ? "Loading..." : currentProject?.name ?? "Select Project"}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={`ml-2 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
          {projects?.map((project) => (
            <div
              key={project.id}
              className={`flex items-center justify-between px-2 py-1.5 ${
                project.id === currentProjectId
                  ? "bg-zinc-800"
                  : "hover:bg-zinc-800/50"
              }`}
            >
              <button
                onClick={() => switchProject(project.id)}
                className="flex-1 truncate text-left text-sm text-zinc-200"
              >
                {project.name}
              </button>
              <div className="flex items-center gap-1">
                {!project.active && (
                  <span className="text-xs text-zinc-600">archived</span>
                )}
                {project.id === currentProjectId && (
                  <Link
                    to={`/projects/${project.id}/settings`}
                    onClick={() => setOpen(false)}
                    className="rounded p-0.5 text-zinc-600 hover:text-zinc-400"
                    title="Project settings"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <circle cx="6" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                      <path d="M6 1v1.5M6 9.5V11M1 6h1.5M9.5 6H11M2.17 2.17l1.06 1.06M8.77 8.77l1.06 1.06M9.83 2.17l-1.06 1.06M3.23 8.77l-1.06 1.06" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                  </Link>
                )}
              </div>
            </div>
          ))}

          {/* New Project link */}
          <div className="border-t border-zinc-800 px-2 pt-1">
            <Link
              to="/projects/new"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1 rounded px-1 py-1.5 text-sm text-zinc-500 hover:text-zinc-300"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              New Project
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
