import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useProject, useArchiveProject } from "../../../hooks/useProjects.js";
import { ProjectForm } from "../../../components/project/ProjectForm.js";
import { PageHeader } from "../../../components/ui/PageHeader.js";
import type { Project } from "../../../types.js";

function ProjectSettingsPage() {
  const { projectId } = Route.useParams();
  const { data: project, isLoading } = useProject(projectId);
  const archiveProject = useArchiveProject();
  const navigate = useNavigate();

  const handleSuccess = (_project: Project) => {
    navigate({ to: "/projects/$projectId", params: { projectId } });
  };

  const handleArchive = async () => {
    if (!project) return;
    await archiveProject.mutateAsync(project.id);
    // Clear localStorage if this was the last-used project
    if (localStorage.getItem("orch8:lastProjectId") === projectId) {
      localStorage.removeItem("orch8:lastProjectId");
    }
    navigate({ to: "/" });
  };

  if (isLoading) {
    return <div className="p-8 text-zinc-500">Loading...</div>;
  }

  if (!project) {
    return <div className="p-8 text-zinc-500">Project not found</div>;
  }

  return (
    <div className="mx-auto max-w-lg p-8">
      <PageHeader title="Settings" subtitle={`Project-level configuration — ${project.name}`} />

      <ProjectForm project={project} onSuccess={handleSuccess} />

      <div className="mt-8 border-t border-zinc-800 pt-6">
        <h2 className="mb-3 text-sm font-medium text-red-400">
          Danger Zone
        </h2>
        {project.active ? (
          <button
            onClick={handleArchive}
            disabled={archiveProject.isPending}
            className="rounded-md border border-red-700 px-4 py-2 text-sm text-red-400 hover:bg-red-950 disabled:opacity-50"
          >
            {archiveProject.isPending ? "Archiving..." : "Archive Project"}
          </button>
        ) : (
          <span className="text-sm text-zinc-500">
            This project is archived
          </span>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/settings")({
  component: ProjectSettingsPage,
});
