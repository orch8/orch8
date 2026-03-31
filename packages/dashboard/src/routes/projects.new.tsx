import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ProjectForm } from "../components/project/ProjectForm.js";
import type { Project } from "../types.js";

export const Route = createFileRoute("/projects/new")({
  component: NewProjectPage,
});

function NewProjectPage() {
  const navigate = useNavigate();

  const handleSuccess = (_project: Project) => {
    navigate({ to: "/" });
  };

  return (
    <div className="mx-auto max-w-lg p-8">
      <h1 className="mb-6 text-xl font-semibold text-zinc-100">
        Create Project
      </h1>
      <ProjectForm onSuccess={handleSuccess} />
    </div>
  );
}
