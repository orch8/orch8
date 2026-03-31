import { createFileRoute } from "@tanstack/react-router";

function DaemonPage() {
  return (
    <div className="h-full">
      <h2 className="mb-4 text-lg font-semibold">Daemon</h2>
      <p className="text-sm text-zinc-500">Coming soon — see Plan 6: System & Onboarding.</p>
    </div>
  );
}

export const Route = createFileRoute("/daemon")({
  component: DaemonPage,
});
