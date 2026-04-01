import { createFileRoute } from "@tanstack/react-router";
import { AgentCreatorChat } from "../../../../components/agent-creator/AgentCreatorChat.js";

function CreateAiPage() {
  const { projectId } = Route.useParams();

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col p-6">
      <AgentCreatorChat projectId={projectId} />
    </div>
  );
}

export const Route = createFileRoute(
  "/projects/$projectId/agents/create-ai",
)({
  component: CreateAiPage,
});
