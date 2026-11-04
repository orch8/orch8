import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import { PipelineDetail } from "../components/pipeline/PipelineDetail.js";

const state = vi.hoisted(() => ({ diff: { available: true, diff: "diff --git a/demo.txt b/demo.txt\n--- a/demo.txt\n+++ b/demo.txt\n@@ -1 +1 @@\n-old\n+new\n" } as { available: boolean; diff: string; reason?: string } }));
vi.mock("../hooks/usePipelines.js", () => ({
  usePipeline: () => ({ data: { pipeline: { id: "pipe_1", name: "Build", projectId: "proj_1", status: "completed", currentStep: 1 }, steps: [] }, isLoading: false, refetch: vi.fn() }),
  usePipelineDiff: () => ({ data: state.diff, isLoading: false, isError: false, refetch: vi.fn() }),
  useCancelPipeline: () => ({ isPending: false }),
  useRetryPipeline: () => ({ isPending: false }),
  useRejectPipelineStep: () => ({ isPending: false }),
  useApprovePipelineStep: () => ({ isPending: false }),
}));

describe("pipeline repository inspection", () => {
  it("renders the actual tracked diff with explicit limits alongside step evidence", () => {
    state.diff = { available: true, diff: "diff --git a/demo.txt b/demo.txt\n--- a/demo.txt\n+++ b/demo.txt\n@@ -1 +1 @@\n-old\n+new\n" };
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.getByText("demo.txt")).toBeInTheDocument();
    expect(screen.getByText(/untracked/i)).toBeInTheDocument();
    expect(screen.getByText(/committed/i)).toBeInTheDocument();
    expect(screen.getByText(/logs/i)).toBeInTheDocument();
  });
  it("explains when the repository diff cannot be inspected", () => {
    state.diff = { available: false, diff: "", reason: "Project directory is not a Git repository root." };
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.getByText("Project directory is not a Git repository root.")).toBeInTheDocument();
  });
});
