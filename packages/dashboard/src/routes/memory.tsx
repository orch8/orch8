import { createFileRoute } from "@tanstack/react-router";
import { MemoryBrowser } from "../components/memory/MemoryBrowser.js";
import { useUiStore } from "../stores/ui.js";

function MemoryPage() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);

  return (
    <div className="h-full">
      <h2 className="mb-4 text-lg font-semibold">Memory</h2>
      <MemoryBrowser projectId={activeProjectId} />
    </div>
  );
}

export const Route = createFileRoute("/memory")({
  component: MemoryPage,
});
