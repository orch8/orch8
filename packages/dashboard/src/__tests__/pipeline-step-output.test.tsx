import { describe, it, expect, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithProviders, screen } from "../test-utils.js";
import { PipelineDetail } from "../components/pipeline/PipelineDetail.js";

const state = vi.hoisted(() => ({ enabled: false }));
vi.mock("../hooks/usePipelines.js", () => ({
  usePipeline: () => ({ data: { pipeline: { id: "pipe_1", name: "Build feature", projectId: "proj_1", status: "running", currentStep: 1 }, steps: [
    { id: "step_1", order: 1, label: "Plan", status: "awaiting_verification", outputSummary: "Plan ready", outputFilePath: ".orch8/pipelines/pipe_1/Plan.md", taskId: null },
  ] }, isLoading: false, refetch: vi.fn() }),
  usePipelineDiff: () => ({ data: { available: false, reason: "No repository" }, isLoading: false, isError: false, refetch: vi.fn() }),
  usePipelineStepOutput: (_pipelineId: string, _stepId: string, _revision: string, enabled: boolean) => {
    state.enabled = enabled;
    return { data: enabled ? { path: ".orch8/pipelines/pipe_1/Plan.md", content: "# Real plan\nImplement a feature." } : undefined, isLoading: false, isError: false };
  },
  useCancelPipeline: () => ({ isPending: false }),
  useRetryPipeline: () => ({ isPending: false }),
  useRejectPipelineStep: () => ({ isPending: false }),
  useApprovePipelineStep: () => ({ isPending: false }),
}));

describe("pipeline plan inspection", () => {
  it("shows the recorded file on request before approval", () => {
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(state.enabled).toBe(false);
    expect(screen.queryByText(/Implement a feature/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Inspect full plan file" }));
    expect(state.enabled).toBe(true);
    expect(screen.getByText(/Implement a feature/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });
});
