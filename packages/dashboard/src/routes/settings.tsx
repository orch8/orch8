import { createFileRoute } from "@tanstack/react-router";

function SettingsPage() {
  return (
    <div className="h-full">
      <h2 className="mb-4 text-lg font-semibold">Settings</h2>
      <p className="text-sm text-zinc-500">Coming soon — see Plan 3: Setup Hub.</p>
    </div>
  );
}

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});
