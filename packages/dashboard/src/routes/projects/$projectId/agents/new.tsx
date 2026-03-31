import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AgentWizard } from "../../../../components/agent-editor/AgentWizard.js";

function NewAgentPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h2 className="mb-6 text-lg font-semibold">Create Agent</h2>
      <AgentWizard
        projectId={projectId}
        onCreated={(agentId) =>
          navigate({
            to: "/projects/$projectId/agents/$agentId",
            params: { projectId, agentId },
          })
        }
      />
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/agents/new")({
  component: NewAgentPage,
});
