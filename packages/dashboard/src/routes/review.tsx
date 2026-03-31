import { createFileRoute } from "@tanstack/react-router";
import { useUiStore } from "../stores/ui.js";
import { ReviewQueue } from "../components/review/ReviewQueue.js";

function ReviewPage() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  return (
    <div className="h-full">
      <h2 className="mb-4 text-lg font-semibold">Review Queue</h2>
      <ReviewQueue projectId={activeProjectId} />
    </div>
  );
}

export const Route = createFileRoute("/review")({
  component: ReviewPage,
});
