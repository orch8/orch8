import { createFileRoute, Outlet } from "@tanstack/react-router";

function AgentsLayout() {
  return <Outlet />;
}

export const Route = createFileRoute("/projects/$projectId/agents")({
  component: AgentsLayout,
});
