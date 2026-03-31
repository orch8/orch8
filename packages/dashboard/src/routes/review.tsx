import { createFileRoute } from "@tanstack/react-router";

function ReviewQueuePage() {
  return (
    <div className="h-full">
      <h2 className="mb-4 text-lg font-semibold">Review Queue</h2>
      <p className="text-sm text-zinc-500">Coming soon — see Plan 4: Work Hub.</p>
    </div>
  );
}

export const Route = createFileRoute("/review")({
  component: ReviewQueuePage,
});
