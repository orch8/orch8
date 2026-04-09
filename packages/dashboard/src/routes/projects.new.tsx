import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ProjectForm } from "../components/project/ProjectForm.js";
import type { Project } from "../types.js";

export const Route = createFileRoute("/projects/new")({
  component: NewProjectPage,
});

function NewProjectPage() {
  const navigate = useNavigate();

  const handleSuccess = (project: Project) => {
    navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
  };

  return (
    <div className="mx-auto max-w-lg p-[var(--gap-section)]">
      <h1 className="mb-[var(--gap-section)] type-title font-semibold text-zinc-100">
        Create Project
      </h1>
      <ProjectForm onSuccess={handleSuccess} />
    </div>
  );
}
