import { createFileRoute } from "@tanstack/react-router";
import { MemoryBrowser } from "../../../components/memory/MemoryBrowser.js";
import { PageHeader } from "../../../components/ui/PageHeader.js";

function MemoryPage() {
  const { projectSlug: projectId } = Route.useParams();

  return (
    <div className="h-full">
      <PageHeader
        title="Memory"
        subtitle="Knowledge entities and facts the agents have learned"
      />
      <MemoryBrowser projectId={projectId} />
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectSlug/memory")({
  component: MemoryPage,
  validateSearch: (search: Record<string, unknown>) => ({
    entity: typeof search.entity === "string" ? search.entity : undefined,
  }),
});
