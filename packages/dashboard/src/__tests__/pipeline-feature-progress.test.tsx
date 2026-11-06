import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, waitFor, within } from "../test-utils.js";
import { fireEvent } from "@testing-library/react";
import { PipelineDetail } from "../components/pipeline/PipelineDetail.js";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../api/client.js", async importOriginal => ({ ...(await importOriginal<typeof import("../api/client.js")>()), api: apiMock }));

const state = vi.hoisted(() => ({
  status: "running",
  currentStep: 1,
  steps: [] as Array<Record<string, unknown>>,
  runs: [] as Array<Record<string, unknown>>,
  log: null as null | { content: string },
  runsLoading: false,
  runsError: false,
  diffError: false,
  diff: { available: false, reason: "No repository" } as Record<string, unknown>,
}));
vi.mock("../hooks/usePipelines.js", () => ({
  usePipeline: () => ({ data: { pipeline: { id: "pipe_1", name: "Feature", projectId: "proj_1", status: state.status, currentStep: state.currentStep }, steps: state.steps }, isLoading: false, refetch: vi.fn() }),
  usePlanAttempts: () => ({ data: [], isLoading: false, isError: false }),
  usePipelineDiff: () => ({ data: state.diff, isLoading: false, isError: state.diffError, refetch: vi.fn() }),
  usePipelineStepOutput: () => ({ data: null, isLoading: false, isError: false, refetch: vi.fn() }),
  useCancelPipeline: () => ({ isPending: false }),
  useRetryPipeline: () => ({ isPending: false }),
  useRejectPipelineStep: () => ({ isPending: false }),
  useApprovePipelineStep: () => ({ isPending: false }),
  useRequestPlanChanges: () => ({ isPending: false }),
  usePublishPipelinePr: () => ({ isPending: false, isError: false }),
}));
vi.mock("../hooks/useRuns.js", () => ({
  useRuns: (_projectId: string, filters?: { taskId?: string }) => ({ data: state.runs.filter(run => run.taskId === filters?.taskId), isLoading: state.runsLoading, isError: state.runsError, refetch: vi.fn() }),
  useRunLog: (runId: string | null) => ({ data: runId ? state.log : null, isLoading: false, isError: false, refetch: vi.fn() }),
}));

const step = (label: string, order: number, status: string, extras: Record<string, unknown> = {}) => ({
  id: `step_${order}`, label, order, status, taskId: `task_${order}`, outputSummary: null, outputFilePath: null, ...extras,
});
const progress = () => screen.getByRole("region", { name: "Feature progress" });

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.post.mockReset();
  state.status = "running";
  state.currentStep = 1;
  state.steps = [step("Plan", 1, "running"), step("Implement", 2, "pending"), step("Independent review", 3, "pending")];
  state.runs = [];
  state.log = null;
  state.runsLoading = false;
  state.runsError = false;
  state.diffError = false;
  state.diff = { available: false, reason: "No repository" };
});

describe("feature progress summary", () => {
  it("links the plan, implementation log, review and live diff without inventing a PR", () => {
    state.steps = [step("Plan", 1, "completed"), step("Implement", 2, "running"), step("Independent review", 3, "pending")];
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    const evidence = within(progress()).getByRole("navigation", { name: "Workflow evidence" });
    for (const [name, target] of [
      ["Plan: completed", "workflow-step-step_1"],
      ["Implement: running", "workflow-step-step_2"],
      ["Independent review: pending", "workflow-step-step_3"],
      ["Repository diff", "repository-changes"],
    ]) {
      expect(within(evidence).getByRole("link", { name })).toHaveAttribute("href", `#${target}`);
      expect(document.getElementById(target)).toBeInTheDocument();
    }
    expect(within(evidence).queryByRole("link", { name: /PR #/ })).not.toBeInTheDocument();
  });

  it("links only a PR observed for the current branch commit", () => {
    state.diff = { available: true, prLookup: "found", pullRequest: { number: 18, title: "Feature", state: "OPEN", url: "https://github.com/orch8/orch8/pull/18" } };
    const view = renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    const evidence = within(progress()).getByRole("navigation", { name: "Workflow evidence" });
    expect(within(evidence).getByRole("link", { name: "PR #18 and checks" })).toHaveAttribute("href", "https://github.com/orch8/orch8/pull/18");
    state.diffError = true;
    view.rerender(<PipelineDetail pipelineId="pipe_1" />);
    expect(within(evidence).queryByRole("link", { name: /PR #/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Repository changes" })).queryByRole("link", { name: /#18/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Could not load repository diff/)).toBeInTheDocument();
    state.diffError = false;
    state.diff = { available: true, prLookup: "unavailable" };
    view.rerender(<PipelineDetail pipelineId="pipe_1" />);
    expect(within(evidence).queryByRole("link", { name: /PR #/ })).not.toBeInTheDocument();
  });

  it("does not label a custom workflow as a feature", () => {
    state.steps = [step("Design", 1, "running"), step("Deploy", 2, "pending")];
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.queryByRole("region", { name: "Feature progress" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download evidence" })).not.toBeInTheDocument();
  });

  it("shows the active stage and the human decision at the plan gate", () => {
    state.steps[0] = step("Plan", 1, "awaiting_verification", { outputSummary: "Plan ready" });
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.getByRole("button", { name: "Download evidence" })).toBeEnabled();
    expect(apiMock.get).not.toHaveBeenCalled();
    expect(within(progress()).getByText(/Plan.*awaiting approval/i)).toBeInTheDocument();
    expect(within(progress()).getByText(/Read the plan and approve it or request changes/i)).toBeInTheDocument();
    expect(within(progress()).getByText(/No run recorded for the current implementation task/i)).toBeInTheDocument();
  });

  it("links to the recorded implementation run without claiming its tests passed", () => {
    state.steps = [step("Plan", 1, "completed"), step("Implement", 2, "running"), step("Independent review", 3, "pending")];
    state.runs = [{ id: "run_42", status: "succeeded", taskId: "task_2", agentId: "builder" }];
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    const link = within(progress()).getByRole("link", { name: /run_42.*raw log/i });
    expect(link).toHaveAttribute("href", "#implementation-run-run_42");
    expect(screen.getByRole("region", { name: "Implement run evidence" }).querySelector("#implementation-run-run_42")).toBeInTheDocument();
    expect(within(progress()).getByText(/Run status: succeeded.*test results unverified/i)).toBeInTheDocument();
    expect(within(progress()).queryByText(/tests passed/i)).not.toBeInTheDocument();
    expect(within(progress()).getByText(/No decision needed yet/i)).toBeInTheDocument();
  });

  it("distinguishes unavailable run lookup from missing evidence", () => {
    state.runsError = true;
    const view = renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(within(progress()).getByText(/Could not load implementation runs/i)).toBeInTheDocument();
    state.runsError = false;
    state.runsLoading = true;
    view.rerender(<PipelineDetail pipelineId="pipe_1" />);
    expect(within(progress()).getByText(/Loading implementation runs/i)).toBeInTheDocument();
  });

  it("surfaces independent review as a decision, not a test verdict", () => {
    state.steps = [step("Plan", 1, "completed"), step("Implement", 2, "completed"), step("Independent review", 3, "awaiting_verification", { outputSummary: "Review ready", outputFilePath: "review.md" })];
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(within(progress()).getByText(/Read the independent review and accept or reject it/i)).toBeInTheDocument();
    expect(within(progress()).getByText(/Awaiting your decision/i)).toBeInTheDocument();
  });

  it("opens actual implementation output beside review without equating process exit with test success", () => {
    state.steps = [step("Plan", 1, "completed"), step("Implement", 2, "completed"), step("Independent review", 3, "awaiting_verification", { outputSummary: "Review ready", outputFilePath: "review.md" })];
    state.runs = [{ id: "run_implementation", status: "succeeded", taskId: "task_2", agentId: "implementer" }];
    state.log = { content: "pnpm test\nFAIL expected result\nexit code 1" };
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    const evidence = within(screen.getByRole("region", { name: "Independent review decision" })).getByRole("region", { name: "Implementation test log" });
    expect(within(evidence).getByText(/process status: succeeded/)).toBeInTheDocument();
    expect(within(evidence).queryByText(/FAIL expected result/)).not.toBeInTheDocument();
    fireEvent.click(within(evidence).getByRole("button", { name: "Read implementation run log" }));
    expect(within(evidence).getByText(/pnpm test.*FAIL expected result.*exit code 1/s)).toBeInTheDocument();
  });

  it("shows missing implementation evidence at the review decision", () => {
    state.steps = [step("Plan", 1, "completed"), step("Implement", 2, "completed"), step("Independent review", 3, "awaiting_verification", { outputSummary: "Review ready", outputFilePath: "review.md" })];
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    const evidence = screen.getByRole("region", { name: "Implementation test log" });
    expect(within(evidence).getByText(/No implementation run found/)).toBeInTheDocument();
  });

  it("reports a draft PR only from the observed branch-commit lookup", () => {
    state.status = "completed";
    state.steps = [step("Plan", 1, "completed"), step("Implement", 2, "completed"), step("Independent review", 3, "completed", { outputSummary: "Approved", requiresVerification: true })];
    state.diff = { available: true, prLookup: "found", pullRequest: { number: 18, title: "Feature", state: "OPEN", isDraft: true, url: "https://github.com/orch8/orch8/pull/18" } };
    const view = renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(within(progress()).getByText(/Accepted.*test results still require inspection/i)).toBeInTheDocument();
    expect(within(progress()).getByRole("link", { name: /Draft PR #18/i })).toHaveAttribute("href", "https://github.com/orch8/orch8/pull/18");
    state.diffError = true;
    view.rerender(<PipelineDetail pipelineId="pipe_1" />);
    expect(within(progress()).getByText(/PR status unavailable/)).toBeInTheDocument();
    expect(within(progress()).queryByRole("link", { name: /Draft PR #18/i })).not.toBeInTheDocument();
    state.diffError = false;
    state.diff = { available: true, prLookup: "unavailable" };
    view.rerender(<PipelineDetail pipelineId="pipe_1" />);
    expect(within(progress()).getByText(/PR lookup unavailable/i)).toBeInTheDocument();
    expect(within(progress()).queryByRole("link", { name: /Draft PR/i })).not.toBeInTheDocument();
  });

  it("offers retry on failure and never labels an unobserved PR as created", () => {
    state.status = "failed";
    state.steps[0] = step("Plan", 1, "failed");
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(within(progress()).getByText(/Inspect the failed step and its run log, then retry/i)).toBeInTheDocument();
    expect(within(progress()).getByText(/PR lookup unavailable/i)).toBeInTheDocument();
  });

  it("does not suggest inspecting a nonexistent PR when publication is blocked", () => {
    state.status = "completed";
    state.steps = [step("Plan", 1, "completed"), step("Implement", 2, "completed"), step("Independent review", 3, "completed", { requiresVerification: true })];
    state.diff = { available: true, prLookup: "none", branch: "feature", baseBranch: "v2", committedDiff: "", workingDiff: "" };
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(within(progress()).getByText(/No PR found for this branch commit/i)).toBeInTheDocument();
    expect(within(progress()).getByText(/Publication not ready.*review and repository prerequisites/i)).toBeInTheDocument();
    expect(within(progress()).queryByText(/Inspect the repository PR and checks/i)).not.toBeInTheDocument();
  });

  it("explains why an accepted workflow cannot yet publish an uncommitted diff", () => {
    state.status = "completed";
    state.steps = [step("Plan", 1, "completed"), step("Implement", 2, "completed", { agentId: "builder" }), step("Independent review", 3, "completed", { agentId: "reviewer", requiresVerification: true, outputSummary: "Approved" })];
    state.diff = { available: true, prLookup: "none", branch: "feat/example", baseBranch: "v2", committedDiff: "", workingDiff: "diff --git a/file b/file", untrackedFiles: ["new-file.txt"] };
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.getByText(/Draft PR not ready/)).toBeInTheDocument();
    expect(screen.getByText(/No committed feature changes/)).toBeInTheDocument();
    expect(screen.getByText(/Staged or unstaged changes remain/)).toBeInTheDocument();
    expect(screen.getByText(/Untracked files remain/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create pull request" })).not.toBeInTheDocument();
  });

  it("flags an agent run that ended while implementation remains pending", () => {
    state.steps = [step("Plan", 1, "completed"), step("Implement", 2, "pending"), step("Independent review", 3, "pending")];
    state.runs = [{ id: "run_stalled", status: "succeeded", taskId: "task_2", agentId: "builder" }];
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(within(progress()).getByText(/Run ended without completing implementation.*Inspect its log before retrying/i)).toBeInTheDocument();
  });

  it("does not tell the operator to wait after a planning run ends without a plan", () => {
    state.steps = [step("Plan", 1, "pending"), step("Implement", 2, "pending"), step("Independent review", 3, "pending")];
    state.runs = [{ id: "run_stalled_plan", status: "succeeded", taskId: "task_1", agentId: "planner" }];
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(within(progress()).getByText(/Run ended without completing plan.*Inspect its log before retrying/i)).toBeInTheDocument();
    expect(within(progress()).queryByText(/wait for the current step/i)).not.toBeInTheDocument();
  });

  it("checks the sandbox without rerunning an incomplete planning step", async () => {
    state.steps = [step("Plan", 1, "pending", { agentId: "planner" }), step("Implement", 2, "pending"), step("Independent review", 3, "pending")];
    state.runs = [{ id: "run_stalled_plan", status: "succeeded", taskId: "task_1", agentId: "planner" }];
    apiMock.get.mockResolvedValue({ adapterType: "codex_local", adapterConfig: { sandbox: "workspace-write", dangerouslyBypassApprovalsAndSandbox: false } });
    apiMock.post.mockResolvedValueOnce({ ok: false, message: "bwrap: loopback: Failed RTM_NEWADDR" });
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    fireEvent.click(within(progress()).getByRole("button", { name: /check plan agent runtime/i }));
    expect(await within(progress()).findByText(/Runtime unavailable: bwrap: loopback/)).toBeInTheDocument();
    expect(apiMock.post).toHaveBeenCalledTimes(1);
    expect(apiMock.post).toHaveBeenCalledWith("/adapter/codex_local/test-environment", { config: { sandbox: "workspace-write", dangerouslyBypassApprovalsAndSandbox: false } });
  });

  it("reports readiness without waking the agent after a successful runtime check", async () => {
    state.steps = [step("Plan", 1, "completed"), step("Implement", 2, "pending", { agentId: "implementer" }), step("Independent review", 3, "pending")];
    state.currentStep = 2;
    state.runs = [{ id: "run_stalled", status: "succeeded", taskId: "task_2", agentId: "implementer" }];
    apiMock.get.mockResolvedValue({ adapterType: "codex_local", adapterConfig: { sandbox: "workspace-write", dangerouslyBypassApprovalsAndSandbox: false } });
    apiMock.post.mockResolvedValueOnce({ ok: true });
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    fireEvent.click(within(progress()).getByRole("button", { name: /check implement agent runtime/i }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    expect(within(progress()).getByText(/No run was queued by this check/)).toBeInTheDocument();
  });

  it("shows implementation rework rather than a previously rejected review", () => {
    state.currentStep = 2;
    state.steps = [step("Plan", 1, "completed"), step("Implement", 2, "pending"), step("Independent review", 3, "failed", { outputSummary: "[REJECTED] Fix the issue" })];
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(within(progress()).getByText("Implement · pending")).toBeInTheDocument();
    expect(within(progress()).getByText(/Rejected; changes requested/i)).toBeInTheDocument();
    expect(within(progress()).getByRole("link", { name: /Inspect project runs for earlier attempts/i })).toHaveAttribute("href", "/projects/proj_1/runs");
    expect(within(progress()).queryByText("Independent review · failed")).not.toBeInTheDocument();
  });
});
