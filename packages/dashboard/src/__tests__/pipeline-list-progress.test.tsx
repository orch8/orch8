import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import { PipelineList } from "../components/pipeline/PipelineList.js";
import type { Pipeline } from "../types.js";

vi.mock("../components/pipeline/PipelineDetail.js", () => ({ PipelineDetail: () => null }));
const fetchMock = vi.fn();
const pipeline = { id: "pipe_1", projectId: "proj_1", name: "Add export", status: "running", createdAt: new Date("2026-01-01") } as Pipeline;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function serve(status: string, label: string, order = 1) {
  fetchMock.mockResolvedValue({ ok: true, headers: { get: () => null }, json: async () => ({ pipeline, steps: [
    { id: "one", label, status, order },
    { id: "two", label: "Implement", status: "pending", order: order + 1 },
  ] }) });
}

describe("active feature workflow list", () => {
  it("shows the actual plan approval decision and a link to the workflow", async () => {
    serve("awaiting_verification", "Plan");
    renderWithProviders(<PipelineList pipelines={[pipeline]} />);
    expect(await screen.findByText(/Your decision needed: inspect plan and approve it or cancel the workflow/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open workflow/ })).toHaveAttribute("href", "/projects/proj_1/pipelines/pipe_1");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/pipelines/pipe_1"), expect.anything());
  });

  it("distinguishes a running step from a pending step and a review decision", async () => {
    serve("running", "Plan");
    const view = renderWithProviders(<PipelineList pipelines={[pipeline]} />);
    expect(await screen.findByText(/Plan: step running/)).toBeInTheDocument();
    view.unmount();
    serve("awaiting_verification", "Independent review", 3);
    renderWithProviders(<PipelineList pipelines={[pipeline]} />);
    await waitFor(() => expect(screen.getByText(/Your decision needed: inspect independent review and accept it or reject it/)).toBeInTheDocument());
  });

  it("shows the failed step, actual run error and a route to the log before retry", async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true, headers: { get: () => null }, json: async () => url.includes("/runs?")
        ? [{ id: "run_1", status: "failed", error: "bwrap: loopback: Failed RTM_NEWADDR" }]
        : { pipeline: { ...pipeline, status: "failed" }, steps: [{ id: "one", label: "Plan", status: "failed", taskId: "task_1", order: 1 }] },
    }));
    renderWithProviders(<PipelineList pipelines={[{ ...pipeline, status: "failed" }]} showActions />);
    expect(await screen.findByText(/Plan failed. Inspect the run before retrying/)).toBeInTheDocument();
    expect(await screen.findByText(/bwrap: loopback: Failed RTM_NEWADDR/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open failed task and run log" })).toHaveAttribute("href", "/projects/proj_1/tasks/task_1");
    expect(screen.getByRole("button", { name: "Retry failed step" })).toBeInTheDocument();
    expect(screen.queryByText(/Your decision needed/)).not.toBeInTheDocument();
  });

  it("does not invent a failure cause when the run has no recorded error", async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true, headers: { get: () => null }, json: async () => url.includes("/runs?")
        ? [{ id: "run_1", status: "failed", error: null }]
        : { pipeline: { ...pipeline, status: "failed" }, steps: [{ id: "one", label: "Implement", status: "failed", taskId: "task_1", order: 2 }] },
    }));
    renderWithProviders(<PipelineList pipelines={[{ ...pipeline, status: "failed" }]} />);
    expect(await screen.findByText(/No error message recorded. The run status alone does not explain why the step failed/)).toBeInTheDocument();
  });

  it("does not attribute an older failure to a step after the latest run succeeds", async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true, headers: { get: () => null }, json: async () => url.includes("/runs?")
        ? [{ id: "new", status: "succeeded", error: null }, { id: "old", status: "failed", error: "old unrelated failure" }]
        : { pipeline: { ...pipeline, status: "failed" }, steps: [{ id: "one", label: "Plan", status: "failed", taskId: "task_1", order: 1 }] },
    }));
    renderWithProviders(<PipelineList pipelines={[{ ...pipeline, status: "failed" }]} />);
    expect(await screen.findByText(/Most recent task run: succeeded/)).toBeInTheDocument();
    expect(screen.queryByText(/old unrelated failure/)).not.toBeInTheDocument();
  });

  it("only shows a retry failure on the workflow that was retried", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/retry")) return { ok: false, status: 409, headers: { get: () => null }, json: async () => ({ message: "Still blocked" }) };
      return { ok: true, headers: { get: () => null }, json: async () => ({ pipeline, steps: [{ id: "one", label: "Plan", status: "failed", order: 1 }] }) };
    });
    renderWithProviders(<PipelineList pipelines={[{ ...pipeline, id: "pipe_1", status: "failed" }, { ...pipeline, id: "pipe_2", status: "failed" }]} showActions />);
    fireEvent.click(screen.getAllByRole("button", { name: "Retry failed step" })[0]);
    await waitFor(() => expect(screen.getAllByText(/Retry failed:/)).toHaveLength(1));
  });
});
