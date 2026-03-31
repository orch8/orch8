import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import { ActivityTimeline } from "../components/shared/ActivityTimeline.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

const mockEntries = [
  {
    id: 1,
    projectId: "proj_1",
    agentId: "eng-1",
    taskId: "task_1",
    runId: null,
    message: "Task moved to in_progress",
    level: "info",
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    projectId: "proj_1",
    agentId: null,
    taskId: null,
    runId: null,
    message: "Budget warning: 80% spent",
    level: "warn",
    createdAt: new Date(Date.now() - 60_000).toISOString(),
  },
  {
    id: 3,
    projectId: "proj_1",
    agentId: "eng-1",
    taskId: null,
    runId: "run_1",
    message: "Agent failed with exit code 1",
    level: "error",
    createdAt: new Date(Date.now() - 120_000).toISOString(),
  },
];

describe("ActivityTimeline", () => {
  it("renders activity entries", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockEntries),
    });
    renderWithProviders(
      <ActivityTimeline projectId="proj_1" />,
    );

    await waitFor(() => {
      expect(screen.getByText("Task moved to in_progress")).toBeInTheDocument();
      expect(screen.getByText("Budget warning: 80% spent")).toBeInTheDocument();
      expect(screen.getByText("Agent failed with exit code 1")).toBeInTheDocument();
    });
  });

  it("shows agent name when present", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockEntries),
    });
    renderWithProviders(
      <ActivityTimeline projectId="proj_1" />,
    );

    await waitFor(() => {
      expect(screen.getAllByText("eng-1")).toHaveLength(2);
    });
  });

  it("shows 'View all activity' link when compact", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockEntries),
    });
    renderWithProviders(
      <ActivityTimeline projectId="proj_1" compact />,
    );

    await waitFor(() => {
      expect(screen.getByText("View all activity →")).toBeInTheDocument();
    });
  });

  it("renders color-coded level indicators", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockEntries),
    });
    const { container } = renderWithProviders(
      <ActivityTimeline projectId="proj_1" />,
    );

    await waitFor(() => {
      expect(screen.getByText("Task moved to in_progress")).toBeInTheDocument();
    });

    const infoDot = container.querySelector('[data-level="info"]');
    const warnDot = container.querySelector('[data-level="warn"]');
    const errorDot = container.querySelector('[data-level="error"]');
    expect(infoDot).toBeTruthy();
    expect(warnDot).toBeTruthy();
    expect(errorDot).toBeTruthy();
  });

  it("renders loading state", () => {
    let resolveFetch!: (v: unknown) => void;
    mockFetch.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const { queryClient } = renderWithProviders(
      <ActivityTimeline projectId="proj_1" />,
    );
    expect(screen.getByText("Loading activity...")).toBeInTheDocument();

    // Resolve fetch and cancel queries so cleanup doesn't hang
    resolveFetch({ ok: true, json: () => Promise.resolve([]) });
    queryClient.cancelQueries();
  });
});
