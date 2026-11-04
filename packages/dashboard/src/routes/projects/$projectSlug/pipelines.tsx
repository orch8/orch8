import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageHeader } from "../../../components/ui/PageHeader.js";

function PipelinesLayout() {
  return (
    <div>
      <PageHeader
        title="Feature workflows"
        subtitle="Plan, approve, build and review changes in this repository"
      />
      <Outlet />
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectSlug/pipelines")({
  component: PipelinesLayout,
});
