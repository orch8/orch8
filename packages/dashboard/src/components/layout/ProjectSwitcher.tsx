import { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { ChevronDownIcon, PlusIcon, SettingsIcon } from "lucide-react";
import { useProjects } from "../../hooks/useProjects.js";

export function ProjectSwitcher() {
  const { data: projects, isLoading } = useProjects();
  const params = useParams({ strict: false }) as { projectSlug?: string };
  const currentProjectSlug = params.projectSlug;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentProject = projects?.find((p) => p.slug === currentProjectSlug);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function switchProject(newProjectSlug: string) {
    const currentSuffix = currentProjectSlug
      ? pathname.replace(`/projects/${currentProjectSlug}`, "")
      : "";
    const target = `/projects/${newProjectSlug}${currentSuffix || ""}`;
    navigate({ to: target as any });
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger: mono eyebrow + serif name + live meta */}
      <button
        onClick={() => setOpen(!open)}
        className="focus-ring flex w-full flex-col items-start gap-1 rounded-sm px-2 py-1.5 text-left hover:bg-surface-2"
      >
        <span className="type-label text-whisper">PROJECT</span>
        <span className="flex w-full items-center justify-between gap-2">
          <span className="min-w-0 truncate type-section text-ink">
            {isLoading ? "Loading…" : currentProject?.name ?? "Select Project"}
          </span>
          <ChevronDownIcon
            className={`size-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
        {currentProjectSlug && (
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
            />
            <span className="type-mono text-mute">ready</span>
          </span>
        )}
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-edge-soft bg-surface py-1 shadow-xl">
          {projects?.map((project) => (
            <div
              key={project.id}
              className={`flex items-center justify-between px-2 py-1.5 ${
                project.slug === currentProjectSlug
                  ? "bg-surface-2"
                  : "hover:bg-surface-2"
              }`}
            >
              <button
                onClick={() => switchProject(project.slug)}
                className="focus-ring flex-1 truncate text-left type-body text-ink"
              >
                {project.name}
              </button>
              <div className="flex items-center gap-1">
                {!project.active && (
                  <span className="type-label text-whisper">archived</span>
                )}
                {project.slug === currentProjectSlug && (
                  <Link
                    to={`/projects/${project.slug}/settings` as any}
                    onClick={() => setOpen(false)}
                    className="focus-ring rounded-sm p-0.5 text-whisper hover:text-mute"
                    aria-label="Project settings"
                  >
                    <SettingsIcon className="size-3" />
                  </Link>
                )}
              </div>
            </div>
          ))}

          <div className="border-t border-edge-soft px-2 pt-1">
            <Link
              to="/projects/new"
              onClick={() => setOpen(false)}
              className="focus-ring flex items-center gap-1 rounded-sm px-1 py-1.5 type-body text-mute hover:text-ink"
            >
              <PlusIcon className="size-3.5" />
              New Project
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
