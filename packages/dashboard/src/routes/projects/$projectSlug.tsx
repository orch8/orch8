import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useProject } from "../../hooks/useProjects.js";

const STORAGE_KEY = "orch8:lastProjectSlug";

function ProjectLayout() {
  const { projectSlug: projectId } = Route.useParams();
  const navigate = useNavigate();
  const { data: project, isLoading, isError } = useProject(projectId);

  // Keep the last valid checkout for other UI consumers. Never remember a
  // missing project as the last one opened.
  useEffect(() => {
    if (!project || project.id !== projectId && project.slug !== projectId) return;
    try {
      localStorage.setItem(STORAGE_KEY, projectId);
    } catch {
      // Storage is optional in private browsing.
    }
  }, [projectId, project]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-zinc-600">Loading project...</p>
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-zinc-400">Project not found</p>
        <button
          onClick={() => navigate({ to: "/" })}
          className="rounded-md bg-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-600"
        >
          Go Home
        </button>
      </div>
    );
  }

  return <Outlet />;
}

export const Route = createFileRoute("/projects/$projectSlug")({
  component: ProjectLayout,
});
