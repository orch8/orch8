import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import { useRunLog } from "../../hooks/useRuns.js";
import { SandboxRecoveryGuidance } from "./SandboxRecoveryGuidance.js";

/** A hint about log text, not proof that the adapter failed for this reason. */
export function recognizedRuntimeBlocker(log: string, adapterType: string): string | null {
  if (adapterType === "codex_local" && /\b(?:bwrap|bubblewrap)\b[\s\S]{0,160}Failed RTM_NEWADDR|Failed RTM_NEWADDR[\s\S]{0,160}\b(?:bwrap|bubblewrap)\b/i.test(log)) {
    return "bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted";
  }
  if (adapterType === "claude_local" && /OAuth access token has expired|Claude authentication expired/i.test(log)) {
    return "Claude authentication expired";
  }
  return null;
}

export function StalledRunDiagnosis({ runId, projectId, agentId }: { runId: string; projectId: string; agentId: string }) {
  const { data, isLoading, isError } = useRunLog(runId, projectId);
  const agent = useQuery({
    queryKey: ["agent-runtime-diagnosis", projectId, agentId],
    queryFn: () => api.get<{ adapterType: string }>(`/agents/${encodeURIComponent(agentId)}`, { projectId }),
    enabled: !!data?.content,
  });
  const message = data?.content && agent.data ? recognizedRuntimeBlocker(data.content, agent.data.adapterType) : null;
  if (isLoading || agent.isLoading) return <p className="text-xs text-zinc-400">Checking the last run for a known runtime blocker...</p>;
  if (isError || agent.isError || !data?.content) return <p className="text-xs text-zinc-400">No automatic diagnosis available. Inspect the raw run log below.</p>;
  if (!message || !agent.data) return <p className="text-xs text-zinc-400">No known runtime blocker found for this agent. Inspect the raw run log before deciding how to continue.</p>;
  return <div className="space-y-2">
    <p className="text-xs text-amber-200">This run log mentions a known {agent.data.adapterType === "codex_local" ? "Codex" : "Claude"} runtime error. Verify it in the raw log before retrying.</p>
    <details className="rounded border border-amber-800/60 p-2 text-xs">
      <summary className="cursor-pointer text-amber-200">Host repair details</summary>
      <div className="mt-2"><SandboxRecoveryGuidance message={message} adapterType={agent.data.adapterType} /></div>
    </details>
    <p className="text-xs text-zinc-400">This is a hint from stored log text, not a verified cause. Check the full run log and agent runtime before another run.</p>
  </div>;
}
