import { createFileRoute, Outlet } from "@tanstack/react-router";

function PipelinesLayout() {
  return <Outlet />;
}

export const Route = createFileRoute("/projects/$projectId/pipelines")({
  component: PipelinesLayout,
});
