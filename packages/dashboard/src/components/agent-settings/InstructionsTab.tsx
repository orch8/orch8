import { useEffect, useState } from "react";
import { FormField } from "../shared/FormField.js";
import { MarkdownEditor } from "../shared/MarkdownEditor.js";
import {
  useAgentInstructions,
  useWriteAgentInstructions,
} from "../../hooks/useAgentInstructions.js";

interface InstructionsTabProps {
  agentId: string;
  projectId: string;
}

export function InstructionsTab({ agentId, projectId }: InstructionsTabProps) {
  const { data, isLoading } = useAgentInstructions(agentId, projectId);
  const write = useWriteAgentInstructions(agentId, projectId);

  const [agentsMd, setAgentsMd] = useState("");
  const [heartbeatMd, setHeartbeatMd] = useState("");
  const [initialAgentsMd, setInitialAgentsMd] = useState("");
  const [initialHeartbeatMd, setInitialHeartbeatMd] = useState("");

  useEffect(() => {
    if (!data) return;
    setAgentsMd(data.agentsMd);
    setInitialAgentsMd(data.agentsMd);
    setHeartbeatMd(data.heartbeatMd);
    setInitialHeartbeatMd(data.heartbeatMd);
  }, [data]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (agentsMd !== initialAgentsMd || heartbeatMd !== initialHeartbeatMd) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [agentsMd, heartbeatMd, initialAgentsMd, initialHeartbeatMd]);

  if (isLoading) return <div className="text-xs text-zinc-500">Loading…</div>;

  const agentsDirty = agentsMd !== initialAgentsMd;
  const heartbeatDirty = heartbeatMd !== initialHeartbeatMd;

  async function saveAgents() {
    await write.mutateAsync({ agentsMd });
    setInitialAgentsMd(agentsMd);
  }

  async function saveHeartbeat() {
    await write.mutateAsync({ heartbeatMd });
    setInitialHeartbeatMd(heartbeatMd);
  }

  async function createAgentsStub() {
    const stub = "# Agent\n\nDescribe this agent's role and behavior here.\n";
    await write.mutateAsync({ agentsMd: stub });
    setAgentsMd(stub);
    setInitialAgentsMd(stub);
  }

  async function createHeartbeatStub() {
    const stub = "Describe what this agent should do on each timer wake.\n";
    await write.mutateAsync({ heartbeatMd: stub });
    setHeartbeatMd(stub);
    setInitialHeartbeatMd(stub);
  }

  return (
    <div className="flex flex-col gap-[var(--gap-section)]">
      <FormField
        label={`AGENTS.md${agentsDirty ? " •" : ""}`}
        description="System prompt sent on every wake. Pure markdown — no frontmatter."
      >
        {agentsMd === "" && initialAgentsMd === "" ? (
          <button
            onClick={createAgentsStub}
            className="self-start rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
          >
            Create AGENTS.md
          </button>
        ) : (
          <>
            <MarkdownEditor value={agentsMd} onChange={setAgentsMd} />
            <button
              onClick={saveAgents}
              disabled={!agentsDirty || write.isPending}
              className="mt-2 self-start rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {write.isPending ? "Saving…" : "Save AGENTS.md"}
            </button>
          </>
        )}
      </FormField>

      <FormField
        label={`heartbeat.md${heartbeatDirty ? " •" : ""}`}
        description="Stdin prompt for timer wakes. Missing file fails the run."
      >
        {heartbeatMd === "" && initialHeartbeatMd === "" ? (
          <button
            onClick={createHeartbeatStub}
            className="self-start rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
          >
            Create heartbeat.md
          </button>
        ) : (
          <>
            <MarkdownEditor value={heartbeatMd} onChange={setHeartbeatMd} />
            <button
              onClick={saveHeartbeat}
              disabled={!heartbeatDirty || write.isPending}
              className="mt-2 self-start rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {write.isPending ? "Saving…" : "Save heartbeat.md"}
            </button>
          </>
        )}
      </FormField>
    </div>
  );
}
