import { createFileRoute } from "@tanstack/react-router";
import { CostDashboard } from "../components/cost/CostDashboard.js";
import { useUiStore } from "../stores/ui.js";

function CostPage() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);

  return (
    <div className="h-full">
      <h2 className="mb-4 text-lg font-semibold">Costs</h2>
      <CostDashboard projectId={activeProjectId} />
    </div>
  );
}

export const Route = createFileRoute("/cost")({
  component: CostPage,
});
