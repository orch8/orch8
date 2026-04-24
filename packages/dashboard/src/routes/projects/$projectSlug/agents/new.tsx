import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AgentWizard } from "../../../../components/agent-editor/AgentWizard.js";

function NewAgentPage() {
  const { projectSlug: projectId } = Route.useParams();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-2xl p-[var(--gap-section)]">
      <h2 className="mb-[var(--gap-section)] type-section font-semibold">Create Agent</h2>
      <AgentWizard
        projectId={projectId}
        onCreated={(agentId) =>
          navigate({
            to: "/projects/$projectSlug/agents/$agentId",
            params: { projectSlug: projectId, agentId },
          })
        }
      />
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectSlug/agents/new")({
  component: NewAgentPage,
});
