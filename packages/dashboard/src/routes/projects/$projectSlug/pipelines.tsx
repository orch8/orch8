import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageHeader } from "../../../components/ui/PageHeader.js";

function PipelinesLayout() {
  return (
    <div>
      <PageHeader
        title="Pipelines"
        subtitle="Templates that drive task execution"
      />
      <Outlet />
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectSlug/pipelines")({
  component: PipelinesLayout,
});
