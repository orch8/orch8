import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "../test-utils.js";
import { PipelineDetail } from "../components/pipeline/PipelineDetail.js";

const state = vi.hoisted(() => ({
  status: "running",
  currentStep: 1,
  steps: [] as Array<Record<string, unknown>>,
  runs: [] as Array<Record<string, unknown>>,
  runsLoading: false,
  runsError: false,
  diff: { available: false, reason: "No repository" } as Record<string, unknown>,
}));
vi.mock("../hooks/usePipelines.js", () => ({
  usePipeline: () => ({ data: { pipeline: { id: "pipe_1", name: "Feature", projectId: "proj_1", status: state.status, currentStep: state.currentStep }, steps: state.steps }, isLoading: false, refetch: vi.fn() }),
  usePlanAttempts: () => ({ data: [], isLoading: false, isError: false }),
  usePipelineDiff: () => ({ data: state.diff, isLoading: false, isError: false, refetch: vi.fn() }),
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
  useRunLog: () => ({ data: null, isLoading: false, isError: false, refetch: vi.fn() }),
}));

const step = (label: string, order: number, status: string, extras: Record<string, unknown> = {}) => ({
  id: `step_${order}`, label, order, status, taskId: `task_${order}`, outputSummary: null, outputFilePath: null, ...extras,
});
const progress = () => screen.getByRole("region", { name: "Feature progress" });

beforeEach(() => {
  state.status = "running";
  state.currentStep = 1;
  state.steps = [step("Plan", 1, "running"), step("Implement", 2, "pending"), step("Independent review", 3, "pending")];
  state.runs = [];
  state.runsLoading = false;
  state.runsError = false;
  state.diff = { available: false, reason: "No repository" };
});

describe("feature progress summary", () => {
  it("does not label a custom workflow as a feature", () => {
    state.steps = [step("Design", 1, "running"), step("Deploy", 2, "pending")];
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.queryByRole("region", { name: "Feature progress" })).not.toBeInTheDocument();
  });

  it("shows the active stage and the human decision at the plan gate", () => {
    state.steps[0] = step("Plan", 1, "awaiting_verification", { outputSummary: "Plan ready" });
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
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

  it("reports a draft PR only from the observed branch-commit lookup", () => {
    state.status = "completed";
    state.steps = [step("Plan", 1, "completed"), step("Implement", 2, "completed"), step("Independent review", 3, "completed", { outputSummary: "Approved", requiresVerification: true })];
    state.diff = { available: true, prLookup: "found", pullRequest: { number: 18, title: "Feature", state: "OPEN", isDraft: true, url: "https://github.com/orch8/orch8/pull/18" } };
    const view = renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(within(progress()).getByText(/Accepted.*test results still require inspection/i)).toBeInTheDocument();
    expect(within(progress()).getByRole("link", { name: /Draft PR #18/i })).toHaveAttribute("href", "https://github.com/orch8/orch8/pull/18");
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

  it("shows implementation rework rather than a previously rejected review", () => {
    state.currentStep = 2;
    state.steps = [step("Plan", 1, "completed"), step("Implement", 2, "pending"), step("Independent review", 3, "failed", { outputSummary: "[REJECTED] Fix the issue" })];
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(within(progress()).getByText(/Implement.*pending/i)).toBeInTheDocument();
    expect(within(progress()).getByText(/Rejected; changes requested/i)).toBeInTheDocument();
    expect(within(progress()).queryByText(/Independent review.*failed/i)).not.toBeInTheDocument();
  });
});
