import { useState, type FormEvent } from "react";
import { useAgents } from "../../hooks/useAgents.js";
import { useProject } from "../../hooks/useProjects.js";
import { useCreatePipeline } from "../../hooks/usePipelines.js";
import { api } from "../../api/client.js";

/** An opinionated entry point to the existing pipeline runner, not a second executor. */
export function FeatureIntake({ projectId, onCreated }: { projectId: string; onCreated: (id: string) => void }) {
  const { data: project } = useProject(projectId);
  const { data: agents, isLoading } = useAgents(projectId);
  const create = useCreatePipeline();
  const [feature, setFeature] = useState("");
  const [planner, setPlanner] = useState("");
  const [implementer, setImplementer] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkedKey, setCheckedKey] = useState("");
  const [checkMessage, setCheckMessage] = useState("");
  // Codex defaults to bypassing its sandbox; never start this workflow with
  // that default. Claude's current adapter unconditionally skips permissions.
  const available = (agents ?? []).filter(a => {
    const config = a.adapterConfig as {
      dangerouslyBypassApprovalsAndSandbox?: boolean; sandbox?: string;
      extraArgs?: string[]; configOverrides?: Record<string, string>; profile?: string;
    } | null;
    return a.status === "active" && a.adapterType === "codex_local" &&
      config?.dangerouslyBypassApprovalsAndSandbox === false &&
      config.sandbox === "workspace-write" &&
      !config.extraArgs?.length && !Object.keys(config.configOverrides ?? {}).length && !config.profile;
  });
  const selected = [planner, implementer, reviewer].map(id => available.find(a => a.id === id));
  const selectionKey = JSON.stringify(selected.map(a => [a?.id, a?.adapterConfig]));
  const validSelection = selected.every(Boolean) && reviewer !== implementer;
  const ready = feature.trim().length > 0 && validSelection && checkedKey === selectionKey && !checking && !create.isPending;

  async function checkRuntime() {
    if (!validSelection) return;
    setChecking(true);
    setCheckedKey("");
    setCheckMessage("");
    try {
      for (const agent of selected) {
        const result = await api.post<{ ok: boolean; message?: string }>(
          "/adapter/codex_local/test-environment", { config: agent!.adapterConfig },
        );
        if (!result.ok) throw new Error(`${agent!.name}: ${result.message ?? "Runtime test failed"}`);
      }
      setCheckedKey(selectionKey);
      setCheckMessage("Selected agents passed the runtime check. This does not guarantee a feature run will succeed.");
    } catch (err) {
      setCheckMessage(err instanceof Error ? err.message : "Runtime test failed");
    } finally {
      setChecking(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setError("");
    const request = feature.trim();
    try {
      const result = await create.mutateAsync({
        projectId,
        name: request.slice(0, 120),
        steps: [
          { label: "Plan", agentId: planner, requiresVerification: true,
            promptOverride: `Feature request: ${request}\nInspect the repository and write a concrete, scoped implementation plan to {{pipeline.outputFilePath}}. Do not edit product code. State the test command and expected result. Complete the assigned task with a concise summary of the plan so the operator can approve it.` },
          { label: "Implement", agentId: implementer, requiresVerification: false,
            promptOverride: `Feature request: ${request}\nFollow the approved plan in {{pipeline.context}}. Work in the configured repository. Run relevant tests. Do not bypass approval, permissions, or budget limits. Report changed files, test results, and any PR URL. Write a summary to {{pipeline.outputFilePath}}.` },
          { label: "Independent review", agentId: reviewer, requiresVerification: true,
            promptOverride: `Independently review the implementation of: ${request}\nUse {{pipeline.context}} and inspect the actual repository diff and test output. Do not assume the implementer's report is proof. Report concrete blocking findings or approval, and PR URL if one exists. Write findings to {{pipeline.outputFilePath}}.` },
        ],
      });
      setFeature("");
      onCreated(result.pipeline.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start feature");
    }
  }

  return <section className="rounded-lg border border-zinc-700 bg-zinc-900 p-5" aria-label="New feature">
    <h2 className="text-lg font-semibold text-zinc-100">Build a feature</h2>
    <p className="mt-1 text-sm text-zinc-400">Describe a change, review the agent's plan, then run implementation and independent review. If the work is committed on a separate branch, you can publish it as a draft PR.</p>
    <p className="mt-3 text-xs text-zinc-400">Repository: {project?.homeDir ?? "Loading repository..."}</p>
    <details className="mt-2 text-xs text-zinc-500">
      <summary className="cursor-pointer">Current runtime limits</summary>
      <div className="mt-2 space-y-1 pl-3">
        <p>Planning agents can write to the repository. Planning-only behavior is a prompt instruction, not a read-only sandbox.</p>
        <p>Uses the configured repository and agent permissions, not a new isolated worktree. Keep selected agents' sandbox settings unchanged during the workflow. PR creation is an explicit action after review.</p>
        <p>Check the selected agents before starting. On Linux this tests a shell command in the configured Codex sandbox; other hosts are not supported yet. A text-only response is not proof that planning can inspect the repository.</p>
      </div>
    </details>
    <form onSubmit={submit} className="mt-4 space-y-3">
      <label className="block text-sm text-zinc-300" htmlFor="feature-request">What should change?</label>
      <textarea id="feature-request" rows={4} maxLength={2000} value={feature} onChange={e => setFeature(e.target.value)} placeholder="Describe the behavior users should gain and how to verify it" className="w-full rounded border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100" />
      <div className="grid gap-3 sm:grid-cols-3">
        {([ ["Plan agent", planner, setPlanner], ["Implement agent", implementer, setImplementer], ["Review agent", reviewer, setReviewer] ] as const).map(([label, value, setter]) =>
          <label key={label} className="text-sm text-zinc-300">{label}
            <select aria-label={label} value={value} onChange={e => setter(e.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-zinc-100">
              <option value="">Select agent</option>
              {available.map(a => <option key={a.id} value={a.id}>{a.name} ({a.adapterType})</option>)}
            </select>
          </label>) }
      </div>
      {!isLoading && !available.length && <p role="status" className="text-sm text-amber-300">No eligible Codex agents. Configure active Codex agents with sandbox enabled and approval bypass disabled in Agents before starting.</p>}
      {reviewer && implementer && reviewer === implementer && <p role="alert" className="text-sm text-amber-300">Choose a different agent for independent review.</p>}
      <button type="button" onClick={() => { void checkRuntime(); }} disabled={!validSelection || checking} className="rounded border border-zinc-600 px-4 py-2 text-sm text-zinc-200 disabled:opacity-40">{checking ? "Checking agents..." : "Check agent runtime"}</button>
      {checkMessage && <p role="status" className={checkedKey === selectionKey ? "text-sm text-emerald-300" : "text-sm text-amber-300"}>{checkMessage}</p>}
      {validSelection && checkedKey !== selectionKey && <p className="text-xs text-amber-300">Runtime check required for this agent selection.</p>}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <button type="submit" disabled={!ready} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">Start with a plan</button>
    </form>
  </section>;
}
