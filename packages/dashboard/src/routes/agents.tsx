import { createFileRoute } from "@tanstack/react-router";
import { AgentEditor } from "../components/agent-editor/AgentEditor.js";
import { useUiStore } from "../stores/ui.js";

function AgentsPage() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);

  return (
    <div className="h-full">
      <h2 className="mb-4 text-lg font-semibold">Agents</h2>
      <AgentEditor projectId={activeProjectId} />
    </div>
  );
}

export const Route = createFileRoute("/agents")({
  component: AgentsPage,
});
