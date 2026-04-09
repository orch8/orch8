import { createFileRoute } from "@tanstack/react-router";
import { BriefingPage } from "../../../components/briefing/BriefingPage.js";
import { PageHeader } from "../../../components/ui/PageHeader.js";

function BriefingRoute() {
  const { projectId } = Route.useParams();
  return (
    <div>
      <PageHeader
        title="Briefing"
        subtitle="Status overview for this project"
      />
      <BriefingPage projectId={projectId} />
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/briefing")({
  component: BriefingRoute,
});
