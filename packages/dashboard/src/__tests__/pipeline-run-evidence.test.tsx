import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithProviders, screen, waitFor, within } from "../test-utils.js";
import { PipelineDetail } from "../components/pipeline/PipelineDetail.js";

const state = vi.hoisted(() => ({ steps: [] as Array<Record<string, unknown>> }));
vi.mock("../hooks/usePipelines.js", () => ({
  usePlanAttempts: () => ({ data: [], isLoading: false, isError: false }),
  usePipeline: () => ({ data: { pipeline: { id: "pipe_1", projectId: "proj_1", name: "Feature", status: "running", currentStep: 1 }, steps: state.steps }, isLoading: false, refetch: vi.fn() }),
  usePipelineDiff: () => ({ data: { available: false, reason: "No repository" }, isLoading: false, isError: false, refetch: vi.fn() }),
  usePipelineStepOutput: () => ({ data: null, isLoading: false, isError: false, refetch: vi.fn() }),
  useCancelPipeline: () => ({ isPending: false }),
  useRetryPipeline: () => ({ isPending: false }),
  useRejectPipelineStep: () => ({ isPending: false }),
  useApprovePipelineStep: () => ({ isPending: false }),
  usePublishPipelinePr: () => ({ isPending: false, isError: false }),
}));
vi.mock("../components/runs/RunViewer.js", () => ({ RunViewer: ({ runId }: { runId: string }) => <div role="dialog">Run viewer {runId}</div> }));

const fetchMock = vi.fn();
const ok = (body: unknown) => ({ ok: true, json: async () => body, headers: { get: () => null } });
const missing = { ok: false, status: 404, text: async () => "No log found for this run" };
const failed = { ok: false, status: 500, text: async () => "Failed to read log file" };
function step(id: string, label: string, taskId: string | null = id) {
  return { id, order: 1, label, taskId, status: "running", outputSummary: null, outputFilePath: null };
}
function run(id: string, taskId: string, status: string, error: string | null = null) {
  return { id, taskId, agentId: "builder", status, error, exitCode: status === "succeeded" ? 0 : 1 };
}
beforeEach(() => {
  state.steps = [step("step_1", "Implement")];
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("pipeline step run evidence", () => {
  it("scrolls and focuses a deep-linked step after it renders", async () => {
    state.steps = [step("step_1", "Plan", null), step("step_2", "Independent review", null)];
    window.history.replaceState(null, "", "#workflow-step-step_2");
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    const target = document.getElementById("workflow-step-step_2");
    await waitFor(() => expect(document.activeElement).toBe(target));
    expect(scroll).toHaveBeenCalledWith({ block: "start" });
    window.history.replaceState(null, "", window.location.pathname);
  });

  it("labels steps without an assigned task as having no run yet", () => {
    state.steps = [step("step_1", "Plan", null)];
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    expect(screen.getByText("No task or run recorded yet for this step.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/runs?"), expect.anything());
  });

  it("shows each step's actual run status and raw log inline, preserving the run viewer", async () => {
    state.steps = [step("step_1", "Implement"), step("step_2", "Independent review")];
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/runs?")) return ok([run(url.includes("taskId=step_1") ? "run_1" : "run_2", url.includes("taskId=step_1") ? "step_1" : "step_2", "succeeded")]);
      if (url.includes("run_1/log")) return ok({ content: "tests: 2 failed\ntraceback", bytes: 26, store: "file" });
      if (url.includes("run_2/log")) return ok({ content: "review findings", bytes: 15, store: "file" });
      throw new Error(`unexpected ${url}`);
    });
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    const implement = screen.getByRole("region", { name: "Implement run evidence" });
    const review = screen.getByRole("region", { name: "Independent review run evidence" });
    await waitFor(() => expect(within(implement).getByText(/Run status: succeeded/)).toBeInTheDocument());
    expect(within(review).getByText(/Run status: succeeded/)).toBeInTheDocument();
    expect(within(implement).queryByText("tests: 2 failed\ntraceback")).not.toBeInTheDocument();
    fireEvent.click(within(implement).getByText("Raw log"));
    expect((await within(implement).findByText(/tests: 2 failed traceback/)).textContent).toBe("tests: 2 failed\ntraceback");
    expect(within(review).queryByText("tests: 2 failed\ntraceback")).not.toBeInTheDocument();
    fireEvent.click(within(implement).getByRole("button", { name: /Open run viewer/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("run_1");
    expect(within(implement).queryByText(/Tests passed/i)).not.toBeInTheDocument();
  });

  it("shows failed run error even before opening its log, then exposes the log", async () => {
    fetchMock.mockImplementation(async (url: string) => url.includes("/runs?") ? ok([run("run_bad", "step_1", "failed", "Sandbox preflight failed")]) : ok({ content: "bwrap: network namespace denied", bytes: 31, store: "file" }));
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    const evidence = screen.getByRole("region", { name: "Implement run evidence" });
    expect(await within(evidence).findByRole("alert")).toHaveTextContent("Sandbox preflight failed");
    expect(within(evidence).getByText(/Run status: failed/)).toBeInTheDocument();
    fireEvent.click(within(evidence).getByText("Raw log"));
    expect(await within(evidence).findByText("bwrap: network namespace denied")).toBeInTheDocument();
  });

  it("shows log loading until the endpoint responds, then labels an empty log as unavailable", async () => {
    let finishLog!: (value: ReturnType<typeof ok>) => void;
    fetchMock.mockImplementation(async (url: string) => url.includes("/runs?")
      ? ok([run("run_1", "step_1", "running")])
      : new Promise<ReturnType<typeof ok>>(resolve => { finishLog = resolve; }));
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    const evidence = screen.getByRole("region", { name: "Implement run evidence" });
    await waitFor(() => expect(within(evidence).getByText(/Run status: running/)).toBeInTheDocument());
    fireEvent.click(within(evidence).getByText("Raw log"));
    expect(within(evidence).getByText("Loading run log...")).toBeInTheDocument();
    expect(within(evidence).getByText(/Recent output refreshes every 3 seconds while open/)).toBeInTheDocument();
    expect(within(evidence).getByRole("button", { name: "Refresh log now" })).toBeInTheDocument();
    finishLog(ok({ content: "", bytes: 0, store: "file" }));
    expect(await within(evidence).findByText(/Log is empty/)).toBeInTheDocument();
    expect(within(evidence).getByRole("button", { name: "Refresh log" })).toBeInTheDocument();
  });

  it("distinguishes no run, loading, missing log, and server errors", async () => {
    fetchMock.mockImplementation(async (url: string) => url.includes("/runs?") ? ok([]) : missing);
    const view = renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    const evidence = screen.getByRole("region", { name: "Implement run evidence" });
    expect(within(evidence).getByText(/Loading runs/)).toBeInTheDocument();
    expect(await within(evidence).findByText(/No run recorded yet/)).toBeInTheDocument();
    view.unmount();

    fetchMock.mockImplementation(async (url: string) => url.includes("/runs?") ? ok([run("run_1", "step_1", "succeeded")]) : missing);
    const missingView = renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    const missingEvidence = screen.getByRole("region", { name: "Implement run evidence" });
    await waitFor(() => expect(within(missingEvidence).getByText(/Run status: succeeded/)).toBeInTheDocument());
    fireEvent.click(within(missingEvidence).getByText("Raw log"));
    expect(await within(missingEvidence).findByText(/No stored log found/)).toBeInTheDocument();
    expect(within(missingEvidence).getByRole("button", { name: "Retry" })).toBeInTheDocument();
    missingView.unmount();

    fetchMock.mockImplementation(async (url: string) => url.includes("/runs?") ? ok([run("run_1", "step_1", "failed")]) : failed);
    renderWithProviders(<PipelineDetail pipelineId="pipe_1" />);
    const errorEvidence = screen.getByRole("region", { name: "Implement run evidence" });
    await waitFor(() => expect(within(errorEvidence).getByText(/Run status: failed/)).toBeInTheDocument());
    fireEvent.click(within(errorEvidence).getByText("Raw log"));
    expect(await within(errorEvidence).findByRole("alert")).toHaveTextContent(/Could not load run log/);
  });
});
