import { createFileRoute, Outlet } from "@tanstack/react-router";

function BrainstormLayout() {
  return <Outlet />;
}

export const Route = createFileRoute("/projects/$projectId/brainstorm")({
  component: BrainstormLayout,
});
