import { createFileRoute, Link } from "@tanstack/react-router";
import { useAgent } from "../../../../hooks/useAgents.js";
import { AgentForm } from "../../../../components/agent-editor/AgentForm.js";

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
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{agent.name}</h2>
        <Link
          to="/projects/$projectId/agents"
          params={{ projectId }}
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          ← Back to list
        </Link>
      </div>
      <AgentForm agent={agent} />
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/agents/$agentId")({
  component: AgentDetailPage,
});
