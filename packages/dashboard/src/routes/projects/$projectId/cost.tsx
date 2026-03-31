import { createFileRoute } from "@tanstack/react-router";
import { CostDashboard } from "../../../components/cost/CostDashboard.js";

function CostPage() {
  const { projectId } = Route.useParams();

  return (
    <div className="h-full">
      <h2 className="mb-4 text-lg font-semibold">Costs</h2>
      <CostDashboard projectId={projectId} />
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/cost")({
  component: CostPage,
});
