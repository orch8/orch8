import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAgents, useCreateAgent } from "../../hooks/useAgents.js";
import { useProject } from "../../hooks/useProjects.js";
import { useCreatePipeline } from "../../hooks/usePipelines.js";
import { api } from "../../api/client.js";
import { SandboxRecoveryGuidance } from "./SandboxRecoveryGuidance.js";
import { RepositoryExplorer } from "./RepositoryExplorer.js";

type FeatureDraft = { feature: string; branchName: string; planner: string; implementer: string; reviewer: string; filePaths: string[] };
const validPath = (path: unknown): path is string => typeof path === "string" && path.length > 0 && path.length <= 240 && !/[\r\n]/.test(path);
const draftKey = (projectId: string) => `orch8:feature-draft:${projectId}`;
function featureHandoff(repository: string | undefined, request: string, filePaths: string[], branchName: string): string {
  return [
    "Feature handoff (manual; does not run agents)",
    `Repository path: ${repository ?? "Not loaded; confirm the repository path before proceeding"}`,
    "Feature request (verbatim):",
    request,
    "",
    "Starting file paths (inspect these; they may not be the only files to change):",
    ...(filePaths.length ? filePaths.map(path => `- ${path}`) : ["None selected"]),
    ...(branchName.trim() ? [`Proposed branch name (not prepared): ${branchName.trim()}`] : []),
    "",
    "Inspect the repository and relevant files before making changes. Write a scoped plan and review it before implementation.",
    "Implement only after the plan is reviewed. Run relevant tests and record the actual results. Obtain an independent review of the diff and test evidence before publishing.",
    "This handoff only copies text. No agents have run as part of this handoff and no branch has been prepared by this action.",
  ].join("\n");
}
function readDraft(projectId: string, legacySlug?: string): FeatureDraft {
  const empty = { feature: "", branchName: "", planner: "", implementer: "", reviewer: "", filePaths: [] as string[] };
  try {
    const value = JSON.parse((localStorage.getItem(draftKey(projectId)) ?? (legacySlug ? localStorage.getItem(draftKey(legacySlug)) : null)) ?? "null");
    if (!value || typeof value !== "object") return empty;
    const filePaths: string[] = Array.isArray(value.filePaths) ? [...new Set((value.filePaths as unknown[]).filter(validPath))].slice(0, 5) : [];
    return { feature: typeof value.feature === "string" ? value.feature : "", branchName: typeof value.branchName === "string" ? value.branchName : "", planner: typeof value.planner === "string" ? value.planner : "", implementer: typeof value.implementer === "string" ? value.implementer : "", reviewer: typeof value.reviewer === "string" ? value.reviewer : "", filePaths };
  } catch { return empty; }
}

/** An opinionated entry point to the existing pipeline runner, not a second executor. */
export function FeatureIntake({ projectId, legacySlug, onCreated, activeWorkflow = false }: { projectId: string; legacySlug?: string; onCreated: (id: string) => void; activeWorkflow?: boolean }) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (window.location.hash === "#new-feature") document.getElementById("new-feature")?.scrollIntoView();
  }, []);
  const [draft] = useState(() => readDraft(projectId, legacySlug));
  const { data: project } = useProject(projectId);
  const { data: agents, isLoading } = useAgents(project?.id ?? projectId);
  const createAgent = useCreateAgent();
  const create = useCreatePipeline();
  const [settingUpAgents, setSettingUpAgents] = useState(false);
  const [setupExpanded, setSetupExpanded] = useState<boolean | null>(null);
  const [setupError, setSetupError] = useState("");
  const [codexModel, setCodexModel] = useState("");
  const [agentRuntime, setAgentRuntime] = useState<"codex_local" | "claude_local">("codex_local");
  const [feature, setFeature] = useState(draft.feature);
  const [handoffFeedback, setHandoffFeedback] = useState<"copied" | "manual" | null>(null);
  const copyPending = useRef(false);
  const [copying, setCopying] = useState(false);
  const [filePaths, setFilePaths] = useState(draft.filePaths);
  const [planner, setPlanner] = useState(draft.planner);
  const [implementer, setImplementer] = useState(draft.implementer);
  const [reviewer, setReviewer] = useState(draft.reviewer);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [earlyRuntime, setEarlyRuntime] = useState<"codex_local" | "claude_local" | null>(null);
  const [earlyResult, setEarlyResult] = useState<{ adapter: string; ok: boolean; message: string } | null>(null);
  const [checkedKey, setCheckedKey] = useState("");
  const [checkMessage, setCheckMessage] = useState("");
  const [failedSelectionKey, setFailedSelectionKey] = useState("");
  const [failedAdapter, setFailedAdapter] = useState("");
  const [branchName, setBranchName] = useState(draft.branchName);
  const [branchState, setBranchState] = useState<{ ready: boolean; branch: string; baseBranch: string; reason?: string; note?: string } | null>(null);
  const [branchError, setBranchError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [returning, setReturning] = useState(false);
  const [overview, setOverview] = useState<{ filename: string | null; content: string | null } | null>(null);
  const [overviewError, setOverviewError] = useState(false);
  const [repositoryOrigin, setRepositoryOrigin] = useState<{ origin: string; originAvailable: boolean; configuredRepository: string | null; originMatchesProject: boolean; pushMatchesProject: boolean } | null>(null);
  const [originError, setOriginError] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const [connectingOrigin, setConnectingOrigin] = useState(false);
  const [connectError, setConnectError] = useState("");
  useEffect(() => {
    try {
      if (feature || branchName || planner || implementer || reviewer || filePaths.length) localStorage.setItem(draftKey(projectId), JSON.stringify({ feature, branchName, planner, implementer, reviewer, filePaths }));
      else localStorage.removeItem(draftKey(projectId));
      if (legacySlug && legacySlug !== projectId) localStorage.removeItem(draftKey(legacySlug));
    } catch { /* Private mode or disabled storage: intake remains usable. */ }
  }, [projectId, legacySlug, feature, branchName, planner, implementer, reviewer, filePaths]);
  function clearDraft() {
    setFeature(""); setBranchName(""); setPlanner(""); setImplementer(""); setReviewer(""); setFilePaths([]);
    setHandoffFeedback(null);
    setCheckedKey(""); setCheckMessage(""); setFailedSelectionKey("");
  }
  const handoff = featureHandoff(project?.homeDir, feature, filePaths, branchName);
  const currentHandoff = useRef(handoff);
  currentHandoff.current = handoff;
  useEffect(() => { setHandoffFeedback(null); }, [handoff]);
  async function copyHandoff() {
    if (copyPending.current || !project?.homeDir || !feature.trim()) return;
    copyPending.current = true;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(handoff);
      if (currentHandoff.current === handoff) setHandoffFeedback("copied");
    } catch {
      if (currentHandoff.current === handoff) setHandoffFeedback("manual");
    } finally {
      copyPending.current = false;
      setCopying(false);
    }
  }
  useEffect(() => {
    let active = true;
    setBranchState(null);
    setBranchError("");
    if (project?.id) {
      api.get<{ ready: boolean; branch: string; baseBranch: string; reason?: string; note?: string }>(`/projects/${encodeURIComponent(project.id)}/feature-branch`)
        .then(result => { if (active) setBranchState(result); })
        .catch(() => { if (active) setBranchError("Could not check repository branch readiness. Refresh to retry."); });
    }
    return () => { active = false; };
  }, [project?.id]);
  useEffect(() => {
    let active = true;
    setOverview(null);
    setOverviewError(false);
    if (project?.id) {
      api.get<{ filename: string | null; content: string | null }>(`/projects/${encodeURIComponent(project.id)}/repository-overview`)
        .then(result => { if (active) setOverview(result); })
        .catch(() => { if (active) setOverviewError(true); });
    }
    return () => { active = false; };
  }, [project?.id]);
  useEffect(() => {
    let active = true;
    setRepositoryOrigin(null);
    setOriginError(false);
    if (project?.id) {
      api.get<{ origin: string; originAvailable: boolean; configuredRepository: string | null; originMatchesProject: boolean; pushMatchesProject: boolean }>(`/projects/${encodeURIComponent(project.id)}/repository-origin`)
        .then(result => { if (active) setRepositoryOrigin(result); })
        .catch(() => { if (active) setOriginError(true); });
    }
    return () => { active = false; };
  }, [project?.id]);
  async function prepareBranch() {
    // Branch preparation is separate from connecting a publishing destination.
    if (activeWorkflow || !project?.id || !branchState?.ready || !branchName.trim() || preparing || returning || checkedKey !== selectionKey) return;
    setPreparing(true); setBranchError("");
    try {
      const result = await api.post<{ branch: string; baseBranch: string }>(`/projects/${encodeURIComponent(project.id)}/feature-branch`, { name: branchName.trim() });
      setBranchState({ ready: false, ...result, reason: "Feature branch prepared. Check agent runtime before starting." });
      void queryClient.invalidateQueries({ queryKey: ["feature-branch", project.id] });
      void queryClient.invalidateQueries({ queryKey: ["repository-changes", project.id] });
      setBranchName("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Branch preparation failed";
      try { setBranchError(JSON.parse(message).message ?? message); } catch { setBranchError(message); }
    } finally { setPreparing(false); }
  }
  async function connectOrigin() {
    if (!project?.id || repositoryOrigin?.originAvailable || repositoryOrigin?.configuredRepository || connectingOrigin || activeWorkflow) return;
    setConnectingOrigin(true);
    setConnectError("");
    try {
      await api.post(`/projects/${encodeURIComponent(project.id)}/repository-origin`, { url: githubUrl.trim() });
      const result = await api.get<NonNullable<typeof repositoryOrigin>>(`/projects/${encodeURIComponent(project.id)}/repository-origin`);
      setRepositoryOrigin(result);
      void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      setGithubUrl("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not connect GitHub origin";
      try { setConnectError(JSON.parse(message).message ?? message); } catch { setConnectError(message); }
    } finally { setConnectingOrigin(false); }
  }
  async function returnToBase() {
    if (activeWorkflow || !project?.id || !branchState?.branch || branchState.branch === branchState.baseBranch || preparing || returning) return;
    setReturning(true); setBranchError("");
    try {
      const result = await api.post<{ ready: boolean; branch: string; baseBranch: string; note?: string; reason?: string }>(`/projects/${encodeURIComponent(project.id)}/return-to-base`, {});
      setBranchState(result);
      void queryClient.invalidateQueries({ queryKey: ["feature-branch", project.id] });
      void queryClient.invalidateQueries({ queryKey: ["repository-changes", project.id] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not return to base branch";
      try { setBranchError(JSON.parse(message).message ?? message); } catch { setBranchError(message); }
    } finally { setReturning(false); }
  }
  // Keep Codex's workspace-write gate intact. Claude uses its existing
  // user/project/local permission rules, never an unreviewed CLI override.
  const available = (agents ?? []).filter(a => {
    const config = a.adapterConfig as {
      dangerouslyBypassApprovalsAndSandbox?: boolean; dangerouslySkipPermissions?: boolean;
      sandbox?: string; extraArgs?: string[]; configOverrides?: Record<string, string>;
      profile?: string; command?: string; cwd?: string; env?: Record<string, string>;
      chrome?: boolean; workspaceStrategy?: unknown;
    } | null;
    if (a.status !== "active" || !config) return false;
    if (a.adapterType === "claude_local") return config.dangerouslySkipPermissions === false &&
      !config.extraArgs?.length && !config.command && !config.cwd && !config.env &&
      !config.chrome && !config.workspaceStrategy;
    return a.adapterType === "codex_local" &&
      config.dangerouslyBypassApprovalsAndSandbox === false &&
      config.sandbox === "workspace-write" &&
      !config.extraArgs?.length && !Object.keys(config.configOverrides ?? {}).length && !config.profile;
  });
  const roles = ["planner", "implementer", "reviewer"] as const;
  const preferred = roles.map(role =>
    available.find(agent => agent.id === `feature-${role}` && agent.role === role && agent.adapterType === "codex_local")
    ?? available.find(agent => agent.role === role && agent.adapterType === "codex_local"));
  const preferredClaude = roles.map(role =>
    available.find(agent => agent.id === `feature-claude-${role}` && agent.role === role && agent.adapterType === "claude_local")
    ?? available.find(agent => agent.role === role && agent.adapterType === "claude_local"));
  const completeTeam = (team: typeof preferred) => team.every(Boolean) && new Set(team.map(agent => agent?.id)).size === 3;
  const canUsePreferred = completeTeam(preferred);
  const canUseClaude = completeTeam(preferredClaude);
  function selectTeam(team: typeof preferred) {
    setPlanner(team[0]!.id); setImplementer(team[1]!.id); setReviewer(team[2]!.id);
    setCheckedKey(""); setCheckMessage(""); setFailedSelectionKey("");
  }
  const selected = [planner, implementer, reviewer].map(id => available.find(a => a.id === id));
  async function setupAgents() {
    if (settingUpAgents || isLoading || !project?.id || (agentRuntime === "codex_local" && !codexModel.trim())) return;
    setSettingUpAgents(true);
    setSetupError("");
    try {
      const roles = ["planner", "implementer", "reviewer"] as const;
      const agentId = (role: typeof roles[number]) => agentRuntime === "claude_local" ? `feature-claude-${role}` : `feature-${role}`;
      const incompatible = roles.map(agentId).filter(id =>
        (agents ?? []).some(agent => agent.id === id && !available.some(candidate => candidate.id === id && candidate.adapterType === agentRuntime)));
      if (incompatible.length) throw new Error(`${incompatible.join(", ")} already exists but is not eligible. Check its status and runtime permissions in Agents; existing settings will not be changed.`);
      for (const role of roles) {
        const id = agentId(role);
        if ((agents ?? []).some(agent => agent.id === id)) continue;
        await createAgent.mutateAsync({
          id, projectId: project.id, name: `Feature ${role}`, role,
          adapterType: agentRuntime, model: agentRuntime === "codex_local" ? codexModel.trim() : undefined,
          adapterConfig: agentRuntime === "codex_local"
            ? { model: codexModel.trim(), sandbox: "workspace-write", dangerouslyBypassApprovalsAndSandbox: false }
            : { dangerouslySkipPermissions: false },
          heartbeatEnabled: false, wakeOnAssignment: true, maxConcurrentRuns: 1,
        });
      }
      setPlanner(agentId("planner"));
      setImplementer(agentId("implementer"));
      setReviewer(agentId("reviewer"));
      setCheckedKey("");
    } catch (err) {
      setSetupError(`Could not finish agent setup. Check Agents before retrying. ${err instanceof Error ? err.message : ""}`);
    } finally {
      setSettingUpAgents(false);
    }
  }
  const selectionKey = JSON.stringify(selected.map(a => [a?.id, a?.adapterType, a?.adapterConfig]));
  const validSelection = selected.every(Boolean) && reviewer !== implementer;
  const onFeatureBranch = !!branchState?.branch && branchState.branch !== branchState.baseBranch;
  const ready = !activeWorkflow && !!project?.id && feature.trim().length > 0 && validSelection && onFeatureBranch && checkedKey === selectionKey && !checking && !create.isPending;
  const runtimeBlocked = failedSelectionKey === selectionKey && !!checkMessage;
  const manualHandoff = feature.trim() && <details open={runtimeBlocked || undefined} className="rounded border border-amber-700/60 bg-amber-950/20 p-3 text-sm text-zinc-300" aria-label="Manual feature handoff">
    <summary className="cursor-pointer font-medium text-amber-200">{runtimeBlocked ? "Runtime blocked: continue manually with your feature request" : "Copy request for manual use (optional)"}</summary>
    <p className="mt-2 text-xs text-zinc-300">{runtimeBlocked ? "Orch8 cannot run the selected agents right now. " : ""}Copy this request into a trusted agent session or use it yourself. This does not prepare a branch, run agents, approve a plan, or publish a PR. Review the plan before implementation and verify the actual diff, tests and independent review yourself.</p>
    <button type="button" onClick={() => { void copyHandoff(); }} disabled={!project?.homeDir || copying} className="mt-2 rounded border border-amber-500 px-3 py-2 text-amber-100 disabled:cursor-not-allowed disabled:opacity-40">{copying ? "Copying..." : "Copy feature handoff"}</button>
    {!project?.homeDir && <p className="mt-2 text-amber-300">Load the repository path before copying the handoff.</p>}
    {handoffFeedback === "copied" && <p role="status" className="mt-2 text-emerald-300">Handoff copied to clipboard.</p>}
    {handoffFeedback === "manual" && <div className="mt-2">
      <label htmlFor="manual-feature-handoff" className="block text-amber-300">Clipboard unavailable. Select and copy the handoff below.</label>
      <textarea id="manual-feature-handoff" aria-label="Feature handoff for manual copy" readOnly value={handoff} rows={12} onFocus={event => event.currentTarget.select()} className="mt-2 w-full rounded border border-zinc-600 bg-zinc-950 p-2 font-mono text-xs text-zinc-100" />
    </div>}
  </details>;
  const nextStep = activeWorkflow ? { label: "Inspect existing workflows", target: "active-feature-workflows" }
    : !feature.trim() ? { label: "Describe your feature", target: "feature-request" }
    : !validSelection ? available.length < 2
      ? { label: "Set up feature agents", target: "feature-agent-setup" }
      : { label: "Choose three feature agents", target: "feature-plan-agent" }
      : checkedKey !== selectionKey ? { label: "Check agent runtime", target: "feature-runtime-check" }
        : !onFeatureBranch ? { label: "Prepare a feature branch", target: "feature-branch-name" }
          : { label: "Start with a plan", target: "feature-start-plan" };
  function goToNextStep() {
    if (nextStep.target === "feature-agent-setup") setSetupExpanded(true);
    const target = document.getElementById(nextStep.target);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus({ preventScroll: true });
  }

  async function checkClaudeBeforeSetup() {
    if (!project?.id || earlyRuntime || checking) return;
    setEarlyRuntime("claude_local");
    setEarlyResult(null);
    try {
      const result = await api.post<{ ok: boolean; message?: string }>(
        "/adapter/claude_local/test-environment", {
          config: { dangerouslySkipPermissions: false }, projectId: project.id,
        },
      );
      setEarlyResult({ adapter: "claude_local", ok: result.ok, message: result.message ?? (result.ok ? "Runtime command passed." : "Runtime command failed.") });
    } catch (err) {
      setEarlyResult({ adapter: "claude_local", ok: false, message: err instanceof Error ? err.message : "Runtime check failed." });
    } finally {
      setEarlyRuntime(null);
    }
  }
  async function checkRuntime() {
    if (!validSelection || earlyRuntime) return;
    setChecking(true);
    setCheckedKey("");
    setFailedSelectionKey("");
    setFailedAdapter("");
    setCheckMessage("");
    try {
      for (const agent of selected) {
        try {
          const result = await api.post<{ ok: boolean; message?: string }>(
            `/adapter/${agent!.adapterType}/test-environment`, { config: agent!.adapterConfig,
              ...(agent!.adapterType === "claude_local" ? { projectId: project!.id } : {}) },
          );
          if (!result.ok) throw new Error(`${agent!.name}: ${result.message ?? "Runtime test failed"}`);
        } catch (err) {
          setFailedAdapter(agent!.adapterType);
          throw err;
        }
      }
      setCheckedKey(selectionKey);
      setCheckMessage("Selected agents passed the runtime check. This does not guarantee a feature run will succeed.");
    } catch (err) {
      setFailedSelectionKey(selectionKey);
      setCheckMessage(err instanceof Error ? err.message : "Runtime test failed");
    } finally {
      setChecking(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || activeWorkflow) return;
    setError("");
    const request = feature.trim();
    const contextHint = filePaths.length ? `\nFiles the user selected as starting points (inspect these tracked paths; do not assume they are the only files to change):\n${filePaths.map(path => `- ${path}`).join("\n")}` : "";
    try {
      const current = await api.get<{ branch: string; baseBranch: string }>(`/projects/${encodeURIComponent(project!.id)}/feature-branch`);
      if (!current.branch || current.branch === current.baseBranch || current.branch !== branchState?.branch) {
        setBranchState(null);
        throw new Error("Repository branch changed. Refresh the page and prepare a feature branch before starting.");
      }
      const result = await create.mutateAsync({
        projectId,
        name: request.slice(0, 120),
        steps: [
          { label: "Plan", agentId: planner, requiresVerification: true,
            promptOverride: `Feature request: ${request}${contextHint}\nInspect the repository and write a concrete, scoped implementation plan to {{pipeline.outputFilePath}}. Do not edit product code. State the test command and expected result. Complete the assigned task with a concise summary of the plan so the operator can approve it.` },
          { label: "Implement", agentId: implementer, requiresVerification: false,
            promptOverride: `Feature request: ${request}\nFollow the approved plan in {{pipeline.context}}. Work only on the prepared feature branch in the configured repository. Run relevant tests and record commands, exit codes and bounded output excerpts in {{pipeline.outputFilePath}}; the run log holds full output. Never copy secrets from test output into the artifact. If the implementation is complete and the tests pass, commit only the intended feature files on this branch; inspect the staged diff before committing. If branch preparation left Orch8's generated .gitignore change, inspect it and include it only if it solely adds the .orch8/ ignore rule. Do not stage unrelated work or pipeline output files. Do not push, publish a PR, merge, or change approval, permission or budget settings. If tests fail or the branch/worktree is not safe to commit, leave changes uncommitted and report the blocker instead. Report the commit hash (if any), changed files, and test results in the summary.` },
          { label: "Independent review", agentId: reviewer, requiresVerification: true,
            promptOverride: `Independently review the implementation of: ${request}\nUse {{pipeline.context}} and inspect the actual committed branch diff, any uncommitted changes, and the implementation run's real test output. Do not assume the implementer's report is proof. Do not edit or commit product files, push, publish a PR, merge, or change approval, permission or budget settings. Report concrete blocking findings or approval, including the reviewed commit hash and whether the reported tests are supported by the run log. Write findings to {{pipeline.outputFilePath}}.` },
        ],
      });
      setFeature("");
      setFilePaths([]);
      setBranchName("");
      setPlanner(""); setImplementer(""); setReviewer("");
      onCreated(result.pipeline.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start feature");
    }
  }

  return <section id="new-feature" className="scroll-mt-6 rounded-lg border border-zinc-700 bg-zinc-900 p-5" aria-label="New feature">
    <h2 className="text-lg font-semibold text-zinc-100">Build a feature</h2>
    <p className="mt-1 text-sm text-zinc-400">Describe a change, approve the plan, then inspect the implementation, tests, independent review and diff before publishing a draft PR.</p>
    <div className="mt-4 space-y-3">
      <p className="text-xs text-zinc-400">Repository: {project?.homeDir ?? "Loading repository..."}</p>
      <div className="min-w-0">
        <div className="min-w-0">
          <h3 className="mb-2 text-sm font-semibold text-zinc-100">1. Describe the feature</h3>
          <label className="block text-sm text-zinc-300" htmlFor="feature-request">What should change?</label>
          <textarea id="feature-request" rows={3} maxLength={2000} value={feature} onChange={e => setFeature(e.target.value)} placeholder="Describe the behavior users should gain and how to verify it" className="mt-2 w-full rounded border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100" />
        </div>

      </div>
      <h3 className="text-sm font-semibold text-zinc-100">2. Choose your agents</h3>
      {!isLoading && <details open={setupExpanded ?? available.length < 3} className="rounded border border-zinc-700 p-3 text-sm text-zinc-300">
        <summary id="feature-agent-setup" className="cursor-pointer font-medium text-blue-200" onClick={event => {
          event.preventDefault();
          setSetupExpanded(!(setupExpanded ?? available.length < 3));
        }}>Feature agent setup{available.length >= 3 ? " (optional)" : ""}</summary>
        <p className="mt-3">Feature workflows need three eligible agents, with a separate reviewer. Set them up here instead of configuring each by hand.</p>
        <label className="mt-2 block text-xs text-zinc-300" htmlFor="feature-agent-runtime">Feature agent runtime</label>
        <select id="feature-agent-runtime" value={agentRuntime} onChange={event => { setAgentRuntime(event.target.value as "codex_local" | "claude_local"); setSetupExpanded(true); }} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-zinc-100">
          <option value="codex_local">Codex (workspace-write sandbox)</option>
          <option value="claude_local">Claude Code (existing permissions)</option>
        </select>
        <p className="mt-1 text-xs text-zinc-400">Creates missing agents without running them or changing existing agents. Codex keeps workspace-write and approval bypass off. Claude uses default permission mode; headless runs cannot grant new permissions. Check the runtime before preparing a branch, then approve the plan.</p>
        {agentRuntime === "codex_local" && <>
          <label className="mt-2 block text-xs text-zinc-300" htmlFor="feature-codex-model">Codex model for new agents</label>
          <input id="feature-codex-model" value={codexModel} onChange={event => setCodexModel(event.target.value)} placeholder="Model available to your Codex account" className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-zinc-100" />
          <p className="mt-1 text-xs text-zinc-400">Use a model supported by your Codex account. Existing agents keep their model; change it in Agents if needed. The runtime check may report a host sandbox failure before it can check model access.</p>
        </>}
        <button type="button" onClick={() => { void setupAgents(); }} disabled={settingUpAgents || !project?.id || (agentRuntime === "codex_local" && !codexModel.trim())} className="mt-2 rounded border border-blue-500 px-3 py-2 text-blue-200 disabled:opacity-40">{settingUpAgents ? "Setting up agents..." : "Set up feature agents"}</button>
        {setupError && <p role="alert" className="mt-2 text-red-300">{setupError}</p>}
      </details>}
      <div className="grid gap-3 sm:grid-cols-3" aria-label="Feature agents">
        {([ ["Plan agent", planner, setPlanner], ["Implement agent", implementer, setImplementer], ["Review agent", reviewer, setReviewer] ] as const).map(([label, value, setter]) =>
          <label key={label} className="text-sm text-zinc-300">{label}
            <select id={label === "Plan agent" ? "feature-plan-agent" : undefined} aria-label={label} value={value} onChange={e => setter(e.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-zinc-100">
              <option value="">Select agent</option>
              {available.map(a => <option key={a.id} value={a.id}>{a.name} ({a.adapterType})</option>)}
            </select>
          </label>) }
      </div>
      {(canUsePreferred || canUseClaude) && <div className="flex flex-wrap gap-2" aria-label="Choose a feature team">
        {canUsePreferred && <button type="button" onClick={() => selectTeam(preferred)} className="rounded border border-blue-500 px-3 py-2 text-sm text-blue-200">Use Codex feature agents</button>}
        {canUseClaude && <button type="button" onClick={() => selectTeam(preferredClaude)} className="rounded border border-blue-500 px-3 py-2 text-sm text-blue-200">Use Claude feature agents</button>}
      </div>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded border border-blue-800 bg-blue-950/40 p-3 text-sm" aria-label="Next feature step">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-blue-300">Next step</p>
        <p className="mt-1 text-zinc-100">{nextStep.label}</p>
        {failedSelectionKey === selectionKey && <p className="mt-1 text-xs text-amber-300">The runtime check failed. Read the result below before retrying.</p>}
      </div>
      <button type="button" onClick={goToNextStep} className="rounded border border-blue-500 px-3 py-2 text-blue-200">Go to step</button>
    </div>
    <div className="mt-2 flex items-center gap-3 text-xs text-zinc-400">
      <span>Feature request and agent choices are saved in this browser for this project until you start a plan or clear them. Runtime approval is never saved.</span>
      {(feature || branchName || planner || implementer || reviewer || filePaths.length > 0) && <button type="button" onClick={clearDraft} className="shrink-0 text-blue-300 underline">Clear draft</button>}
    </div>

    </div>
    {activeWorkflow && <p role="status" className="mt-3 rounded border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-200">Existing workflow work may still need attention. <a href="#active-feature-workflows" className="underline">Inspect existing workflows</a> and finish, retry or cancel them before starting another plan. Your draft stays here.</p>}
    <form onSubmit={submit} className="mt-4 space-y-3">
      {!isLoading && !available.length && <p role="status" className="text-sm text-amber-300">No eligible feature agents yet. Set up feature agents above or configure active agents in Agents.</p>}
      {reviewer && implementer && reviewer === implementer && <p role="alert" className="text-sm text-amber-300">Choose a different agent for independent review.</p>}
      <h3 className="text-sm font-semibold text-zinc-100">3. Check runtime</h3>
      <button id="feature-runtime-check" type="button" onClick={() => { void checkRuntime(); }} disabled={!validSelection || checking} className="rounded border border-zinc-600 px-4 py-2 text-sm text-zinc-200 disabled:opacity-40">{checking ? "Checking agents..." : "Check agent runtime"}</button>
      {checkMessage && failedSelectionKey === selectionKey && <p role="status" className="text-sm text-amber-300">{checkMessage}</p>}
      {checkMessage && checkedKey === selectionKey && <p role="status" className="text-sm text-emerald-300">{checkMessage}</p>}
      <SandboxRecoveryGuidance message={failedSelectionKey === selectionKey ? checkMessage : ""} adapterType={failedAdapter} />
      {runtimeBlocked && manualHandoff}
      {validSelection && checkedKey !== selectionKey && <p className="text-xs text-amber-300">Runtime check required for this agent selection.</p>}
      <div className="space-y-2 rounded border border-zinc-700 p-3 text-sm text-zinc-300" aria-label="Prepare feature branch">
        <h3 className="font-medium">4. Prepare a feature branch (required)</h3>
        <p>Current branch: {branchState?.branch || "Checking..."} · Configured base: {branchState?.baseBranch ?? project?.defaultBranch ?? "Checking..."}</p>
        {onFeatureBranch && <div className="space-y-1">
          <p className="text-xs text-zinc-400">Finished the previous feature? Return to the existing local base branch before preparing another. The repository must be clean except for Orch8's unchanged generated .gitignore addition, which stays uncommitted. This does not reset, delete, commit, push, edit the base branch, or run agents.</p>
          <button type="button" onClick={() => { void returnToBase(); }} disabled={activeWorkflow || returning || preparing} className="rounded border border-zinc-600 px-3 py-2 text-zinc-200 disabled:opacity-40">{returning ? "Returning..." : "Return to base branch"}</button>
        </div>}
        <p className="text-xs text-zinc-400">Check the agent runtime first, so an unavailable sandbox does not leave an unused branch behind. This creates and checks out a new local branch; it does not commit, push, or start agents.</p>
        <label className="block" htmlFor="feature-branch-name">New feature branch name</label>
        <div className="flex flex-wrap gap-2">
          <input id="feature-branch-name" value={branchName} onChange={e => setBranchName(e.target.value)} placeholder="feat/my-feature" className="min-w-48 flex-1 rounded border border-zinc-700 bg-zinc-950 p-2 text-zinc-100" />
          <button type="button" onClick={() => { void prepareBranch(); }} disabled={activeWorkflow || !branchState?.ready || !branchName.trim() || preparing || returning || checkedKey !== selectionKey} className="rounded border border-blue-500 px-3 py-2 text-blue-200 disabled:cursor-not-allowed disabled:opacity-40">{preparing ? "Preparing..." : "Prepare feature branch"}</button>
        </div>
        {branchState?.reason && <p role="status" className="text-amber-300">{branchState.reason}</p>}
        {branchState?.note && <p role="status" className="text-amber-300">{branchState.note} Include it in the feature commit if you want the ignore rule in the PR.</p>}
        {branchError && <p role="alert" className="text-red-300">{branchError}</p>}
      </div>
      {branchState && !onFeatureBranch && <p role="status" className="text-xs text-amber-300">Start is unavailable on the base branch. Check the agents above, then prepare a feature branch.</p>}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <h3 className="text-sm font-semibold text-zinc-100">5. Plan and approve</h3>
      <p className="text-xs text-zinc-400">Starting runs the planning agent. Review and approve its plan before implementation can begin.</p>
      <button id="feature-start-plan" type="submit" disabled={!ready} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">Start with a plan</button>
    </form>
    <details className="mt-5 border-t border-zinc-700 pt-4" aria-label="Optional feature tools">
      <summary className="cursor-pointer text-sm font-medium text-blue-200">Context and publishing tools{filePaths.length ? ` · ${filePaths.length} starting files selected` : ""}</summary>
      <div className="mt-3 space-y-3">
        <aside className="min-w-0 rounded border border-zinc-700 bg-zinc-950 p-3 self-start" aria-label="Repository overview">
          <h3 className="text-sm font-medium text-zinc-100">Repository overview</h3>
          <details>
            <summary className="mt-2 cursor-pointer text-sm text-blue-200">Read root README</summary>
            <p className="mt-2 text-xs text-zinc-400">Root README{overview?.filename ? ` · ${overview.filename}` : ""} · plain-text preview, up to 64 KiB</p>
            {overviewError ? <p className="mt-3 text-sm text-amber-300">Could not load repository overview. You can still draft a feature.</p>
              : !overview ? <p className="mt-3 text-sm text-zinc-400">Loading README...</p>
                : overview.content === null ? <p className="mt-3 text-sm text-zinc-400">No root README available. You can still draft a feature.</p>
                  : <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-300">{overview.content}</pre>}
          </details>
          <p className="mt-2 text-xs text-zinc-400">Open for context without leaving your feature request.</p>
        </aside>
      {project?.id && <RepositoryExplorer key={`${project.id}:${branchState?.branch ?? "checking"}`} projectId={project.id} addedPaths={filePaths} onAddFile={path => { if (validPath(path)) setFilePaths(current => current.includes(path) || current.length >= 5 ? current : [...current, path]); }} />}
      {filePaths.length > 0 && <div aria-label="Selected feature files" className="rounded border border-zinc-700 p-3 text-sm text-zinc-300">
        <p>Starting files for the plan ({filePaths.length}/5). Only paths are sent to the planning agent; inspect the approved plan before implementation.</p>
        <ul className="mt-2 space-y-1">{filePaths.map(path => <li key={path} className="flex items-center gap-2"><span className="min-w-0 break-all font-mono text-xs">{path}</span><button type="button" aria-label={`Remove ${path}`} onClick={() => setFilePaths(current => current.filter(value => value !== path))} className="shrink-0 text-blue-300 underline">Remove</button></li>)}</ul>
      </div>}

      {!runtimeBlocked && manualHandoff}
    <details aria-label="Check Claude before setup" className="mt-4 rounded border border-zinc-700 bg-zinc-950/60 p-3 text-sm text-zinc-300">
      <summary className="cursor-pointer font-medium text-blue-200">Check Claude Code early (optional)</summary>
      <div className="mt-2 space-y-2">
      <p className="text-xs text-zinc-400">Check before setting up a team or preparing a branch. This invokes Claude's model and tests a real command and temporary write in this checkout using existing permissions, so it may incur model cost and respects the project budget. It does not create agents, start a feature, or change permissions. Codex checks its sandbox after agent selection below. You must still check all selected agents before starting.</p>
      <button type="button" disabled={!project?.id || !!earlyRuntime || checking} onClick={() => void checkClaudeBeforeSetup()} className="rounded border border-blue-600 px-3 py-2 text-blue-200 disabled:opacity-40">{earlyRuntime ? "Checking Claude..." : "Check Claude before setup"}</button>
      {earlyResult && <p role="status" className={earlyResult.ok ? "text-emerald-300" : "text-amber-300"}>Claude {earlyResult.ok ? "runtime passed" : "runtime unavailable"}: {earlyResult.message}</p>}
      {earlyResult && !earlyResult.ok && <SandboxRecoveryGuidance message={earlyResult.message} adapterType="claude_local" />}
      </div>
    </details>

    <details className="mt-2 rounded border border-zinc-700 p-3 text-xs text-zinc-300" aria-label="Pull request readiness">
      <summary className="cursor-pointer font-medium text-blue-200">GitHub PR setup (optional until publishing){originError ? " · origin check failed" : repositoryOrigin && !repositoryOrigin.origin ? repositoryOrigin.originAvailable ? " · unsupported origin" : " · no origin connected" : repositoryOrigin && (!repositoryOrigin.configuredRepository || !repositoryOrigin.originMatchesProject || !repositoryOrigin.pushMatchesProject) ? " · needs attention" : ""}</summary>
      <div className="mt-2">
      {originError ? <p role="status" className="mt-1 text-amber-300">Could not check this checkout's origin. Inspect it before expecting a PR.</p>
        : !repositoryOrigin ? <p className="mt-1">Checking repository origin...</p>
          : !repositoryOrigin.origin ? <>
            <p role="status" className="mt-1 text-amber-300">{repositoryOrigin.originAvailable ? "This checkout's origin is not a supported GitHub URL." : "This checkout has no origin."} You can build locally, but Orch8 cannot publish a PR from it.</p>
            {!repositoryOrigin.originAvailable && !repositoryOrigin.configuredRepository && <div className="mt-3 space-y-2">
              <label htmlFor="feature-github-origin" className="block text-zinc-200">Connect an existing checkout to GitHub</label>
              <div className="flex flex-wrap gap-2">
                <input id="feature-github-origin" type="url" value={githubUrl} onChange={event => setGithubUrl(event.target.value)} placeholder="https://github.com/owner/repo.git" className="min-w-64 flex-1 rounded border border-zinc-700 bg-zinc-950 p-2 text-zinc-100" />
                <button type="button" onClick={() => { void connectOrigin(); }} disabled={!githubUrl.trim() || connectingOrigin || activeWorkflow} className="rounded border border-blue-500 px-3 py-2 text-blue-200 disabled:opacity-40">{connectingOrigin ? "Connecting..." : "Connect GitHub origin"}</button>
              </div>
              <p className="text-zinc-400">Adds this URL as the checkout's origin and saves it on the project. It does not fetch, push, or check your access. Existing origins are never replaced.</p>
              {connectError && <p role="alert" className="text-amber-300">{connectError}</p>}
            </div>}
          </>
            : !repositoryOrigin.configuredRepository ? <p role="status" className="mt-1 text-amber-300">Origin: {repositoryOrigin.origin}. This project has no supported GitHub repository URL in Settings. You can build locally, but Orch8 cannot publish a PR until you configure it.</p>
              : !repositoryOrigin.originMatchesProject || !repositoryOrigin.pushMatchesProject ? <p role="status" className="mt-1 text-amber-300">Origin: {repositoryOrigin.origin}. Project URL: {repositoryOrigin.configuredRepository}. {repositoryOrigin.originMatchesProject ? "The origin push URL does not match the project URL." : "The origin does not match the project URL."} Fix this before expecting Orch8 to publish a PR. No remote is changed here.</p>
                : <p className="mt-1 break-all">Origin and push destination match {repositoryOrigin.configuredRepository}. Publishing still requires push access, a clean feature commit, and an accepted review.</p>}
      </div>
    </details>
    <details className="mt-2 text-xs text-zinc-500">
      <summary className="cursor-pointer">Current runtime limits</summary>
      <div className="mt-2 space-y-1 pl-3">
        <p>Planning agents can write to the repository. Planning-only behavior is a prompt instruction, not a read-only sandbox.</p>
        <p>Uses the configured repository and agent permissions, not a new isolated worktree. Keep selected agents' sandbox settings unchanged during the workflow. PR creation is an explicit action after review.</p>
        <p>Codex checks its workspace-write shell on Linux. Claude checks a real Bash command and temporary file write with the selected repository's existing permissions. A text-only answer does not pass.</p>
        <p>Claude print mode cannot ask interactively. If the existing Claude permission settings deny Bash or Write, the check blocks the workflow; configure permissions deliberately in Claude settings, never via bypass flags.</p>
      </div>
    </details>
      </div>
    </details>
  </section>;
}