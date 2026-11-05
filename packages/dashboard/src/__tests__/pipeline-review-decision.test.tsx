import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders, screen } from "../test-utils.js";
import { PipelineDetail } from "../components/pipeline/PipelineDetail.js";

const state = vi.hoisted(() => ({ content: "# Independent review\nNo blocking findings.", freshContent: "", label: "Independent review", error: false, fetching: false, path: ".orch8/pipelines/pipe_1/Independent review.md", approve: vi.fn() }));
vi.mock("../hooks/usePipelines.js", () => ({
  usePlanAttempts: () => ({ data: [], isLoading: false, isError: false }),
  usePipeline: () => ({ data: { pipeline: { id: "pipe_1", name: "Build feature", projectId: "proj_1", status: "running", currentStep: 3 }, steps: [
    { id: "step_1", order: 1, label: "Plan", status: "completed" },
    { id: "step_2", order: 2, label: "Implement", agentId: "builder", status: "completed" },
    { id: "step_3", order: 3, label: state.label, agentId: "checker", requiresVerification: true, status: "awaiting_verification", outputSummary: "Review ready", outputFilePath: state.path },
  ] }, isLoading: false, refetch: vi.fn() }),
  usePipelineDiff: () => ({ data: { available: false, reason: "No repository" }, isLoading: false, isError: false, refetch: vi.fn() }),
  usePipelineStepOutput: (_pipelineId: string, stepId: string, _revision: string, enabled: boolean) => ({
    data: enabled && stepId === "step_3" && !state.error ? { path: state.path, content: state.content } : undefined,
    isLoading: false, isFetching: state.fetching, isError: enabled && state.error,
    refetch: async () => ({ isError: state.error, data: state.error ? undefined : { path: state.path, content: state.freshContent || state.content } }),
  }),
  useCancelPipeline: () => ({ isPending: false }),
  useRetryPipeline: () => ({ isPending: false }),
  useRejectPipelineStep: () => ({ isPending: false }),
  useApprovePipelineStep: () => ({ isPending: false, mutate: state.approve }),
  usePublishPipelinePr: () => ({ isPending: false, isError: false }),
}));

beforeEach(() => {
  state.content = "# Independent review\nNo blocking findings.";
  state.error = false;
  state.fetching = false;
  state.freshContent = "";
  state.label = "Independent review";
  state.approve.mockClear();
});

describe("independent review decision", () => {
  it("shows the full report and requires explicit acceptance", async () => {
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.getByText(/No blocking findings/)).toBeInTheDocument();
    expect(screen.getByText(/does not verify the tests or publish a PR/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    const accept = screen.getByRole("button", { name: "Accept review" });
    expect(accept).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /I read the full independent review/ }));
    expect(accept).toBeEnabled();
    fireEvent.click(accept);
    await waitFor(() => expect(state.approve).toHaveBeenCalledWith({ pipelineId: "pipe_1", stepId: "step_3" }));
    expect(screen.getAllByRole("button", { name: "Reject" })).not.toHaveLength(0);
  });

  it("blocks acceptance if the file is empty, missing or being refreshed", () => {
    state.content = " ";
    const view = renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.getByRole("button", { name: "Accept review" })).toBeDisabled();
    state.content = "Review complete";
    view.rerender(<PipelineDetail pipelineId="pipe_1" />);
    fireEvent.click(screen.getByRole("checkbox", { name: /I read the full independent review/ }));
    state.fetching = true;
    view.rerender(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.getByRole("button", { name: "Accept review" })).toBeDisabled();
    state.fetching = false;
    state.error = true;
    view.rerender(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.getByRole("button", { name: "Accept review" })).toBeDisabled();
    expect(screen.getByText(/Review file unavailable/)).toBeInTheDocument();
  });

  it("rechecks the live report and refuses acceptance if it changed", async () => {
    state.label = "Security verification";
    state.freshContent = "# New review\nBlocking finding.";
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.getByText(/custom verification step can finish the workflow, but cannot use that PR action/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /I read the full independent review/ }));
    fireEvent.click(screen.getByRole("button", { name: "Accept review" }));
    await waitFor(() => expect(screen.getByText(/review changed or could not be refreshed/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Accept review" })).toBeDisabled();
    expect(state.approve).not.toHaveBeenCalled();
  });

  it("does not treat Preview as a review", () => {
    state.label = "Preview";
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.queryByRole("button", { name: "Accept review" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  });
});
