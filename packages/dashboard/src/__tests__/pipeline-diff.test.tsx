import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import { fireEvent } from "@testing-library/react";
import { PipelineDetail } from "../components/pipeline/PipelineDetail.js";

const state = vi.hoisted(() => ({ publish: vi.fn(), steps: [] as Array<{ id: string; label: string; order: number; agentId: string; status: string; outputSummary: string; outputFilePath?: string; requiresVerification?: boolean }>, diff: { available: true, diff: "", committedDiff: "", workingDiff: "", baseBranch: "main", untrackedFiles: [] as string[], untrackedMore: false } as { available: boolean; diff: string; committedDiff?: string; workingDiff?: string; baseBranch?: string; untrackedFiles?: string[]; publicationOutputPaths?: string[]; untrackedMore?: boolean; reason?: string; branch?: string; prLookup?: string; pullRequest?: { number: number; title: string; state: string; url: string; checks?: { name: string; status: string; url: string | null }[] } | null } }));
vi.mock("../hooks/usePipelines.js", () => ({
  usePipeline: () => ({ data: { pipeline: { id: "pipe_1", name: "Build", projectId: "proj_1", status: "completed", currentStep: 1 }, steps: state.steps }, isLoading: false, refetch: vi.fn() }),
  usePlanAttempts: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  usePipelineDiff: () => ({ data: state.diff, isLoading: false, isError: false, refetch: vi.fn() }),
  useCancelPipeline: () => ({ isPending: false }),
  useRetryPipeline: () => ({ isPending: false }),
  useRejectPipelineStep: () => ({ isPending: false }),
  useApprovePipelineStep: () => ({ isPending: false }),
  usePublishPipelinePr: () => ({ isPending: false, isError: false, mutate: state.publish }),
  usePipelineStepOutput: () => ({ data: null, isLoading: false, isError: false, refetch: vi.fn() }),
}));

describe("pipeline repository inspection", () => {
  beforeEach(() => { state.steps = []; state.publish.mockClear(); });
  it("offers an explicit confirmation only for a completed independent review and no existing PR", () => {
    state.steps = [
      { id: "i", label: "implement", order: 1, agentId: "builder", status: "completed", outputSummary: "done" },
      { id: "r", label: "Independent review", order: 2, agentId: "reviewer", status: "completed", outputSummary: "checked", requiresVerification: true },
    ];
    state.diff = { available: true, diff: "", baseBranch: "v2", branch: "feature", committedDiff: "changes", workingDiff: "", untrackedFiles: [], prLookup: "none", pullRequest: null };
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    fireEvent.click(screen.getByRole("button", { name: "Create pull request" }));
    expect(screen.getByText(/publishes the committed branch/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm create pull request" }));
    expect(state.publish).toHaveBeenCalledWith("pipe_1", expect.anything());
  });
  it("allows recorded pipeline output files but not unrelated untracked changes", () => {
    state.steps = [
      { id: "i", label: "implement", order: 1, agentId: "builder", status: "completed", outputSummary: "done", outputFilePath: ".orch8/pipelines/p1/Implement.md" },
      { id: "r", label: "Independent review", order: 2, agentId: "reviewer", status: "completed", outputSummary: "checked", outputFilePath: ".orch8/pipelines/p1/Independent review.md", requiresVerification: true },
    ];
    const plans = ["Plan.md", "Plan-task1.md", "Plan-task2.md"].map(name => `.orch8/pipelines/p1/${name}`);
    state.diff = { available: true, diff: "", baseBranch: "v2", branch: "feature", committedDiff: "changes", workingDiff: "", publicationOutputPaths: plans, untrackedFiles: [...plans, ".orch8/pipelines/p1/Independent review.md"], prLookup: "none", pullRequest: null };
    const view = renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.getByRole("button", { name: "Create pull request" })).toBeInTheDocument();
    expect(screen.getByText(/Recorded pipeline artifacts allowed/)).toBeInTheDocument();
    expect(screen.getAllByText(plans[0])).toHaveLength(2);
    state.diff = { ...state.diff, untrackedFiles: [...plans, ".orch8/pipelines/p1/unrelated.md"] };
    view.rerender(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.queryByRole("button", { name: "Create pull request" })).not.toBeInTheDocument();
  });
  it("separates committed and working changes, indicates untracked files and explains limits", () => {
    state.diff = { available: true, diff: "", baseBranch: "stable", committedDiff: "diff --git a/committed.txt b/committed.txt\n--- a/committed.txt\n+++ b/committed.txt\n@@ -0,0 +1 @@\n+new\n", workingDiff: "diff --git a/staged.txt b/staged.txt\n--- a/staged.txt\n+++ b/staged.txt\n@@ -0,0 +1 @@\n+staged\n", untrackedFiles: ["untracked.txt"], untrackedMore: true };
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.getByText("committed.txt")).toBeInTheDocument();
    expect(screen.getByText("staged.txt")).toBeInTheDocument();
    expect(screen.getByText("untracked.txt")).toBeInTheDocument();
    expect(screen.getByText(/more untracked files/i)).toBeInTheDocument();
    expect(screen.getByText(/stable/)).toBeInTheDocument();
    expect(screen.getByText(/logs/i)).toBeInTheDocument();
  });
  it("explains when the repository diff cannot be inspected", () => {
    state.diff = { available: false, diff: "", reason: "Project directory is not a Git repository root." };
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.getByText("Project directory is not a Git repository root.")).toBeInTheDocument();
  });
  it("links only a verified branch-commit PR and labels it repository-wide", () => {
    state.diff = { available: true, diff: "", baseBranch: "v2", branch: "feature", prLookup: "found",
      pullRequest: { number: 18, title: "Feature", state: "OPEN", url: "https://github.com/orch8/orch8/pull/18" } };
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    const link = screen.getByRole("link", { name: "#18 Feature" });
    expect(link).toHaveAttribute("href", "https://github.com/orch8/orch8/pull/18");
    expect(screen.getByText(/not proof that the pipeline created the PR/)).toBeInTheDocument();
  });
  it("shows actual check outcomes and does not call missing checks passing", () => {
    state.diff = { available: true, diff: "", baseBranch: "v2", branch: "feature", prLookup: "found",
      pullRequest: { number: 18, title: "Feature", state: "OPEN", url: "https://github.com/orch8/orch8/pull/18", checks: [
        { name: "Build and test", status: "FAILURE", url: "https://github.com/orch8/orch8/actions/runs/42" },
      ] } };
    const view = renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.getByRole("link", { name: /Build and test: FAILURE/ })).toHaveAttribute("href", "https://github.com/orch8/orch8/actions/runs/42");
    state.diff = { ...state.diff, pullRequest: { ...state.diff.pullRequest!, checks: [] } };
    view.rerender(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.getByText(/No checks reported for this commit/)).toBeInTheDocument();
    expect(screen.queryByText(/Build and test: FAILURE/)).not.toBeInTheDocument();
  });
  it("does not claim a PR exists when lookup has no match", () => {
    state.diff = { available: true, diff: "", baseBranch: "v2", branch: "feature", prLookup: "none", pullRequest: null };
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.getByText(/No GitHub PR found/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /#18/ })).not.toBeInTheDocument();
  });
});
