import { createFileRoute } from "@tanstack/react-router";
import { ReviewQueue } from "../../../components/review/ReviewQueue.js";

function ReviewPage() {
  const { projectId } = Route.useParams();

  return (
    <div className="h-full">
      <h2 className="mb-4 text-lg font-semibold">Review Queue</h2>
      <ReviewQueue projectId={projectId} />
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/review")({
  component: ReviewPage,
});
