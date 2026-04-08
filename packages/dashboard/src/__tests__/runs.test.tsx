import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import { RunInspector } from "../components/runs/RunInspector.js";

vi.mock("../hooks/WsEventsProvider.js", () => ({
  useWsEvents: () => ({
    connected: true,
    send: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  }),
}));

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

  it("filters runs by start date", async () => {
    const filterableRuns = [
      {
        id: "run_old",
        agentId: "eng",
        projectId: "proj_1",
        taskId: null,
        status: "succeeded",
        startedAt: "2026-03-20T10:00:00Z",
        finishedAt: "2026-03-20T10:05:00Z",
        costUsd: 0.1,
        invocationSource: "timer",
      },
      {
        id: "run_new",
        agentId: "eng",
        projectId: "proj_1",
        taskId: null,
        status: "succeeded",
        startedAt: "2026-04-01T10:00:00Z",
        finishedAt: "2026-04-01T10:05:00Z",
        costUsd: 0.1,
        invocationSource: "timer",
      },
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(filterableRuns),
    });

    renderWithProviders(<RunInspector projectId="proj_1" />);

    // Both runs visible with no filter.
    await waitFor(() => {
      expect(screen.getByText("run_old")).toBeInTheDocument();
      expect(screen.getByText("run_new")).toBeInTheDocument();
    });

    // Type a start date that only matches run_new.
    const startInput = screen.getByLabelText("Start date");
    await userEvent.type(startInput, "2026-03-25");

    await waitFor(() => {
      expect(screen.queryByText("run_old")).not.toBeInTheDocument();
      expect(screen.getByText("run_new")).toBeInTheDocument();
    });
  });

  it("filters runs by end date", async () => {
    const filterableRuns = [
      {
        id: "run_old",
        agentId: "eng",
        projectId: "proj_1",
        taskId: null,
        status: "succeeded",
        startedAt: "2026-03-20T10:00:00Z",
        finishedAt: "2026-03-20T10:05:00Z",
        costUsd: 0.1,
        invocationSource: "timer",
      },
      {
        id: "run_new",
        agentId: "eng",
        projectId: "proj_1",
        taskId: null,
        status: "succeeded",
        startedAt: "2026-04-01T10:00:00Z",
        finishedAt: "2026-04-01T10:05:00Z",
        costUsd: 0.1,
        invocationSource: "timer",
      },
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(filterableRuns),
    });

    renderWithProviders(<RunInspector projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByText("run_old")).toBeInTheDocument();
      expect(screen.getByText("run_new")).toBeInTheDocument();
    });

    const endInput = screen.getByLabelText("End date");
    await userEvent.type(endInput, "2026-03-25");

    await waitFor(() => {
      expect(screen.getByText("run_old")).toBeInTheDocument();
      expect(screen.queryByText("run_new")).not.toBeInTheDocument();
    });
  });
});
