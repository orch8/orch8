import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import { RunInspector } from "../components/runs/RunInspector.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

const mockRuns = [
  {
    id: "run_1",
    agentId: "eng",
    projectId: "proj_1",
    taskId: "task_1",
    status: "succeeded",
    startedAt: "2026-03-30T10:00:00Z",
    finishedAt: "2026-03-30T10:05:00Z",
    costUsd: 0.25,
    invocationSource: "timer",
  },
  {
    id: "run_2",
    agentId: "qa",
    projectId: "proj_1",
    taskId: "task_2",
    status: "failed",
    startedAt: "2026-03-30T11:00:00Z",
    finishedAt: "2026-03-30T11:02:00Z",
    costUsd: 0.1,
    invocationSource: "assignment",
    error: "Process exited with code 1",
  },
];

describe("RunInspector", () => {
  it("renders run list", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockRuns),
    });

    renderWithProviders(<RunInspector projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByText("run_1")).toBeInTheDocument();
      expect(screen.getByText("run_2")).toBeInTheDocument();
    });
  });

  it("shows run status badges", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockRuns),
    });

    renderWithProviders(<RunInspector projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByText("succeeded")).toBeInTheDocument();
      expect(screen.getByText("failed")).toBeInTheDocument();
    });
  });
});
