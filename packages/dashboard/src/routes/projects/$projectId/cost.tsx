import { createFileRoute } from "@tanstack/react-router";
import { CostDashboard } from "../../../components/cost/CostDashboard.js";
import { PageHeader } from "../../../components/ui/PageHeader.js";

function CostPage() {
  const { projectId } = Route.useParams();

  return (
    <div className="h-full">
      <PageHeader
        title="Cost"
        subtitle="Spend by agent, by day, and by task"
      />
      <CostDashboard projectId={projectId} />
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/cost")({
  component: CostPage,
});
