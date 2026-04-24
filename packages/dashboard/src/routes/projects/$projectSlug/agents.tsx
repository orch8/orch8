import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageHeader } from "../../../components/ui/PageHeader.js";

function AgentsLayout() {
  return (
    <div>
      <PageHeader
        title="Agents"
        subtitle="Configure the agents that work on this project"
      />
      <Outlet />
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectSlug/agents")({
  component: AgentsLayout,
});
