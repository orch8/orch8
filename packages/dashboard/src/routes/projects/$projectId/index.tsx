import { createFileRoute, Navigate } from "@tanstack/react-router";

function ProjectIndexRedirect() {
  const { projectId } = Route.useParams();
  return (
    <Navigate
      to="/projects/$projectId/chat"
      params={{ projectId }}
      replace
    />
  );
}

export const Route = createFileRoute("/projects/$projectId/")({
  component: ProjectIndexRedirect,
});
