import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("does not imply a failed workflow needs an approval", () => {
    renderWithProviders(<PipelineList pipelines={[{ ...pipeline, status: "failed" }]} />);
    expect(screen.queryByText(/Your decision needed/)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
