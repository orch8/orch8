import { createFileRoute } from "@tanstack/react-router";
import { DaemonPageComponent } from "../components/daemon/DaemonPage.js";

function DaemonRoute() {
  return (
    <div className="h-full">
      <h2 className="mb-4 text-lg font-semibold">Daemon</h2>
      <DaemonPageComponent />
    </div>
  );
}

export const Route = createFileRoute("/daemon")({
  component: DaemonRoute,
});
