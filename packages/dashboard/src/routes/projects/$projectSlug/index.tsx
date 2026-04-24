import { createFileRoute, Navigate } from "@tanstack/react-router";

function ProjectIndexRedirect() {
  const { projectSlug: projectId } = Route.useParams();
  return (
    <Navigate
      to="/projects/$projectSlug/chat"
      params={{ projectSlug: projectId }}
      replace
    />
  );
}

export const Route = createFileRoute("/projects/$projectSlug/")({
  component: ProjectIndexRedirect,
});
