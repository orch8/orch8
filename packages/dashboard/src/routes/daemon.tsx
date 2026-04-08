import { createFileRoute } from "@tanstack/react-router";
import { DaemonPageComponent } from "../components/daemon/DaemonPage.js";
import { PageHeader } from "../components/ui/PageHeader.js";

function DaemonRoute() {
  return (
    <div className="h-full">
      <PageHeader title="Daemon" subtitle="orch8 background process" />
      <DaemonPageComponent />
    </div>
  );
}

export const Route = createFileRoute("/daemon")({
  component: DaemonRoute,
});
