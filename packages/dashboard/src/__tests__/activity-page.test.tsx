import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import { ActivityPage } from "../routes/activity.js";
import { useUiStore } from "../stores/ui.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  useUiStore.setState({ activeProjectId: "proj_1" });
});

const mockEntries = [
  { id: 1, projectId: "proj_1", agentId: "eng-1", taskId: "task_1", runId: null, message: "Task transitioned to in_progress", level: "info", createdAt: new Date().toISOString() },
  { id: 2, projectId: "proj_1", agentId: null, taskId: null, runId: null, message: "Budget warning at 80%", level: "warn", createdAt: new Date().toISOString() },
  { id: 3, projectId: "proj_1", agentId: "eng-1", taskId: null, runId: "run_1", message: "Run failed: exit code 1", level: "error", createdAt: new Date().toISOString() },
];

describe("ActivityPage", () => {
  it("renders activity entries with timestamps", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockEntries) });
    renderWithProviders(<ActivityPage />);

    await waitFor(() => {
      expect(screen.getByText("Task transitioned to in_progress")).toBeInTheDocument();
      expect(screen.getByText("Budget warning at 80%")).toBeInTheDocument();
    });
  });

  it("renders level filter dropdown", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });
    renderWithProviders(<ActivityPage />);

    expect(screen.getByLabelText("Filter by level")).toBeInTheDocument();
  });

  it("renders pagination controls", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockEntries) });
    renderWithProviders(<ActivityPage />);

    await waitFor(() => {
      expect(screen.getByText("Older")).toBeInTheDocument();
    });
  });
});
