import { createFileRoute, Navigate } from "@tanstack/react-router";

function ProjectIndexRedirect() {
  const { projectSlug: projectId } = Route.useParams();
  return (
    <Navigate
      to="/projects/$projectSlug/board"
      params={{ projectSlug: projectId }}
      replace
    />
  );
}

export const Route = createFileRoute("/projects/$projectSlug/")({
  component: ProjectIndexRedirect,
});
