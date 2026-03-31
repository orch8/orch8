import { createFileRoute } from "@tanstack/react-router";
import { MemoryBrowser } from "../../../components/memory/MemoryBrowser.js";

function MemoryPage() {
  const { projectId } = Route.useParams();

  return (
    <div className="h-full">
      <h2 className="mb-4 text-lg font-semibold">Memory</h2>
      <MemoryBrowser projectId={projectId} />
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/memory")({
  component: MemoryPage,
  validateSearch: (search: Record<string, unknown>) => ({
    entity: typeof search.entity === "string" ? search.entity : undefined,
  }),
});
