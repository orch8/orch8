import { createFileRoute } from "@tanstack/react-router";

function ActivityPage() {
  return (
    <div className="h-full">
      <h2 className="mb-4 text-lg font-semibold">Activity Log</h2>
      <p className="text-sm text-zinc-500">Coming soon — see Plan 5: Monitor Hub.</p>
    </div>
  );
}

export const Route = createFileRoute("/activity")({
  component: ActivityPage,
});
