import { describe, it, expect, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithProviders, screen } from "../test-utils.js";
import { PipelineDetail } from "../components/pipeline/PipelineDetail.js";

const state = vi.hoisted(() => ({ content: "# Real plan\nImplement a feature.", enabled: false, error: false, label: "Plan", approve: vi.fn() }));
vi.mock("../hooks/usePipelines.js", () => ({
  usePipeline: () => ({ data: { pipeline: { id: "pipe_1", name: "Build feature", projectId: "proj_1", status: "running", currentStep: 1 }, steps: [
    { id: "step_1", order: 1, label: state.label, status: "awaiting_verification", outputSummary: "Plan ready", outputFilePath: ".orch8/pipelines/pipe_1/Plan.md", taskId: null },
  ] }, isLoading: false, refetch: vi.fn() }),
  usePipelineDiff: () => ({ data: { available: false, reason: "No repository" }, isLoading: false, isError: false, refetch: vi.fn() }),
  usePipelineStepOutput: (_pipelineId: string, _stepId: string, _revision: string, enabled: boolean) => {
    state.enabled = enabled;
    return { data: enabled && state.content ? { path: ".orch8/pipelines/pipe_1/Plan.md", content: state.content } : undefined, isLoading: false, isError: enabled && (state.error || !state.content), refetch: vi.fn() };
  },
  useCancelPipeline: () => ({ isPending: false }),
  useRetryPipeline: () => ({ isPending: false }),
  useRejectPipelineStep: () => ({ isPending: false }),
  useApprovePipelineStep: () => ({ isPending: false, mutate: state.approve }),
}));

describe("pipeline plan decision", () => {
  it("shows the complete recorded plan before allowing approval", () => {
    state.content = "# Real plan\nImplement a feature.";
    state.approve.mockClear();
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(state.enabled).toBe(true);
    expect(screen.getByText(/Implement a feature/)).toBeInTheDocument();
    const approve = screen.getByRole("button", { name: "Approve plan" });
    expect(approve).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /I have reviewed the full plan/ }));
    expect(approve).toBeEnabled();
    fireEvent.click(approve);
    expect(state.approve).toHaveBeenCalledWith({ pipelineId: "pipe_1", stepId: "step_1" });
  });

  it("does not offer approval when the recorded plan cannot be read", () => {
    state.content = "";
    state.approve.mockClear();
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/File unavailable/);
    expect(screen.getByRole("button", { name: "Approve plan" })).toBeDisabled();
  });

  it("requires inspection for the bundled lowercase plan step", () => {
    state.label = "plan";
    state.content = "# Repository plan";
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.getByText("# Repository plan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve plan" })).toBeDisabled();
    state.label = "Plan";
  });

  it("blocks approval if refreshing the file fails after acknowledgement", () => {
    state.content = "# Real plan";
    state.error = false;
    const view = renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    fireEvent.click(screen.getByRole("checkbox", { name: /I have reviewed the full plan/ }));
    expect(screen.getByRole("button", { name: "Approve plan" })).toBeEnabled();
    state.error = true;
    view.rerender(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.getByRole("button", { name: "Approve plan" })).toBeDisabled();
    state.error = false;
  });
});
