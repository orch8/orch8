import { createFileRoute } from "@tanstack/react-router";
import { BriefingPage } from "../../../components/briefing/BriefingPage.js";
import { PageHeader } from "../../../components/ui/PageHeader.js";

function BriefingRoute() {
  const { projectSlug: projectId } = Route.useParams();
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

export const Route = createFileRoute("/projects/$projectSlug/briefing")({
  component: BriefingRoute,
});
