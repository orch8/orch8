import { createFileRoute, Link } from "@tanstack/react-router";
import { useAgent } from "../../../../hooks/useAgents.js";
import { AgentSettingsPage } from "../../../../components/agent-settings/AgentSettingsPage.js";

function AgentDetailPage() {
  const { projectId, agentId } = Route.useParams();
  const { data: agent, isLoading } = useAgent(agentId, projectId);

  if (isLoading) {
    return <p className="text-sm text-zinc-600">Loading agent...</p>;
  }

  if (!agent) {
    return <p className="text-sm text-zinc-500">Agent not found.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <Link
          to="/projects/$projectId/agents"
          params={{ projectId }}
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          ← Back to agents
        </Link>
      </div>
      <AgentSettingsPage agent={agent} projectId={projectId} />
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/agents/$agentId")({
  component: AgentDetailPage,
});
