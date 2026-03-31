import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useUiStore } from "../stores/ui.js";
import { AgentWizard } from "../components/agent-editor/AgentWizard.js";

function NewAgentPage() {
  const navigate = useNavigate();
  const activeProjectId = useUiStore((s) => s.activeProjectId);

  if (!activeProjectId) {
    return (
      <div className="p-8">
        <p className="text-sm text-zinc-500">Select a project first to create an agent.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h2 className="mb-6 text-lg font-semibold">Create Agent</h2>
      <AgentWizard
        projectId={activeProjectId}
        onCreated={(agentId) => navigate({ to: "/agents/$id", params: { id: agentId } })}
      />
    </div>
  );
}

export const Route = createFileRoute("/agents/new")({
  component: NewAgentPage,
});
