import { createFileRoute } from "@tanstack/react-router";
import { RunInspector } from "../../../components/runs/RunInspector.js";
import { PageHeader } from "../../../components/ui/PageHeader.js";

function RunsPage() {
  const { projectId } = Route.useParams();

  return (
    <div className="h-full">
      <PageHeader
        title="Runs"
        subtitle="Inspect every heartbeat run, with logs and events"
      />
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
