import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import { PipelineDetail } from "../components/pipeline/PipelineDetail.js";

const state = vi.hoisted(() => ({ diff: { available: true, diff: "", committedDiff: "", workingDiff: "", baseBranch: "main", untrackedFiles: [] as string[], untrackedMore: false } as { available: boolean; diff: string; committedDiff?: string; workingDiff?: string; baseBranch?: string; untrackedFiles?: string[]; untrackedMore?: boolean; reason?: string } }));
vi.mock("../hooks/usePipelines.js", () => ({
  usePipeline: () => ({ data: { pipeline: { id: "pipe_1", name: "Build", projectId: "proj_1", status: "completed", currentStep: 1 }, steps: [] }, isLoading: false, refetch: vi.fn() }),
  usePipelineDiff: () => ({ data: state.diff, isLoading: false, isError: false, refetch: vi.fn() }),
  useCancelPipeline: () => ({ isPending: false }),
  useRetryPipeline: () => ({ isPending: false }),
  useRejectPipelineStep: () => ({ isPending: false }),
  useApprovePipelineStep: () => ({ isPending: false }),
}));

describe("pipeline repository inspection", () => {
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
});
