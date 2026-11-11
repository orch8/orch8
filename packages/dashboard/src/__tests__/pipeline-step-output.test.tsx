import { describe, it, expect, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithProviders, screen } from "../test-utils.js";
import { PipelineDetail } from "../components/pipeline/PipelineDetail.js";

const state = vi.hoisted(() => ({ content: "# Real plan\nImplement a feature.", enabled: false, error: false, label: "Plan", attempts: [] as Array<{ taskId: string; path: string; content: string | null }>, changes: vi.fn(), changeError: null as Error | null, approve: vi.fn() }));
vi.mock("../hooks/usePipelines.js", () => ({
  usePipeline: () => ({ data: { pipeline: { id: "pipe_1", name: "Build feature", projectId: "proj_1", status: "running", currentStep: 1 }, steps: [
    { id: "step_1", order: 1, label: state.label, status: "awaiting_verification", outputSummary: "Plan ready", outputFilePath: ".orch8/pipelines/pipe_1/Plan.md", taskId: null },
  ] }, isLoading: false, refetch: vi.fn() }),
  usePlanAttempts: () => ({ data: state.attempts, isLoading: false, isError: false, refetch: vi.fn() }),
  usePipelineDiff: () => ({ data: { available: false, reason: "No repository" }, isLoading: false, isError: false, refetch: vi.fn() }),
  usePipelineStepOutput: (_pipelineId: string, _stepId: string, _revision: string, enabled: boolean) => {
    state.enabled = enabled;
    return { data: enabled && state.content ? { path: ".orch8/pipelines/pipe_1/Plan.md", content: state.content } : undefined, isLoading: false, isError: enabled && (state.error || !state.content), refetch: vi.fn() };
  },
  useCancelPipeline: () => ({ isPending: false }),
  useRetryPipeline: () => ({ isPending: false }),
  useRejectPipelineStep: () => ({ isPending: false }),
  useRequestPlanChanges: () => ({ isPending: false, mutate: state.changes, error: state.changeError }),
  useApprovePipelineStep: () => ({ isPending: false, mutate: state.approve }),
  usePublishPipelinePr: () => ({ isPending: false, isError: false }),
}));

describe("pipeline plan decision", () => {
  it("shows original and revised plan files beside their planning tasks", () => {
    state.content = "# Revised plan";
    state.attempts = [
      { taskId: "task-1", path: ".orch8/pipelines/pipe_1/Plan.md", content: "# Original plan" },
      { taskId: "task-2", path: ".orch8/pipelines/pipe_1/Plan-task-2.md", content: "# Revised plan" },
    ];
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.getByRole("region", { name: "Plan history" })).toBeInTheDocument();
    expect(screen.getByText("# Original plan")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open planning task and run" })[0]).toHaveAttribute("href", "/projects/proj_1/tasks/task-1");
    expect(screen.getByText("Attempt 2: task-2")).toBeInTheDocument();
    state.attempts = [];
  });
  it("requests revision with feedback without approving implementation and displays errors", () => {
    state.changeError = new Error("Revision failed");
    state.approve.mockClear();
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    const submit = screen.getByRole("button", { name: "Request changes" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Plan feedback" }), { target: { value: "  Add migration details  " } });
    fireEvent.click(submit);
    expect(state.changes).toHaveBeenCalledWith({ pipelineId: "pipe_1", stepId: "step_1", feedback: "Add migration details" });
    expect(state.approve).not.toHaveBeenCalled();
    expect(screen.getByText("Revision failed")).toBeInTheDocument();
    state.changeError = null;
  });

  it("shows the complete recorded plan before allowing approval", () => {
    state.content = "# Real plan\nImplement a feature.";
    state.approve.mockClear();
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(state.enabled).toBe(true);
    expect(screen.getByRole("region", { name: "Plan approval" }).querySelector(".prose p")).toHaveTextContent("Implement a feature.");
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
