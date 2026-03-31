import { createFileRoute } from "@tanstack/react-router";
import { RunInspector } from "../../../components/runs/RunInspector.js";

function RunsPage() {
  const { projectId } = Route.useParams();

  return (
    <div className="h-full">
      <h2 className="text-lg font-semibold mb-4">Runs</h2>
      <RunInspector projectId={projectId} />
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/runs")({
  component: RunsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    run: typeof search.run === "string" ? search.run : undefined,
  }),
});
