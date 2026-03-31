import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import { HomePage } from "../routes/index.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

function mockApiResponses() {
  // agents
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve([
        { id: "eng-1", name: "Engineer", status: "active", projectId: "proj_1", role: "implementer", pauseReason: null },
      ]),
  });
  // tasks
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve([
        { id: "task_1", title: "Auth", column: "in_progress", projectId: "proj_1", executionAgentId: "eng-1" },
        { id: "task_2", title: "Review", column: "review", projectId: "proj_1" },
      ]),
  });
  // cost summary
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ total: 12.5, byAgent: [] }),
  });
  // daemon status
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({ status: "running", pid: 123, uptimeMs: 60000, uptimeFormatted: "1m 0s", processCount: 1, queueDepth: 0, tickIntervalMs: 5000 }),
  });
  // activity log
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve([]),
  });
}

describe("HomePage", () => {
  it("renders stat cards", async () => {
    mockApiResponses();
    renderWithProviders(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText("Active Agents")).toBeInTheDocument();
      expect(screen.getByText("Tasks In Progress")).toBeInTheDocument();
      expect(screen.getByText("Today's Spend")).toBeInTheDocument();
      expect(screen.getByText("Daemon")).toBeInTheDocument();
    });
  });

  it("renders recent activity section", async () => {
    mockApiResponses();
    renderWithProviders(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText("Recent Activity")).toBeInTheDocument();
    });
  });

  it("renders alerts and agent status section", async () => {
    mockApiResponses();
    renderWithProviders(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText("Alerts")).toBeInTheDocument();
      expect(screen.getByText("Agent Status")).toBeInTheDocument();
    });
  });
});
