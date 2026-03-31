import { createFileRoute } from "@tanstack/react-router";
import { RunInspector } from "../components/runs/RunInspector.js";
import { useUiStore } from "../stores/ui.js";

function RunsPage() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);

  return (
    <div className="h-full">
      <h2 className="mb-4 text-lg font-semibold">Runs</h2>
      <RunInspector projectId={activeProjectId} />
    </div>
  );
}

export const Route = createFileRoute("/runs")({
  component: RunsPage,
});
