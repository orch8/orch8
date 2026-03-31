import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import { TaskDetailPanel } from "../components/task-detail/TaskDetailPanel.js";
import { PhaseProgress } from "../components/task-detail/PhaseProgress.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

const mockTask = {
  id: "task_1",
  title: "Build auth",
  description: "Implement OAuth flow",
  taskType: "complex",
  column: "in_progress",
  priority: "high",
  assignee: "engineer",
  complexPhase: "implement",
  projectId: "proj_1",
  createdAt: "2026-03-30T00:00:00Z",
};

describe("TaskDetailPanel", () => {
  it("renders task title and description", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTask),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

    renderWithProviders(<TaskDetailPanel taskId="task_1" />);

    await waitFor(() => {
      expect(screen.getByText("Build auth")).toBeInTheDocument();
      expect(screen.getByText("Implement OAuth flow")).toBeInTheDocument();
    });
  });

  it("shows close button", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTask),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

    renderWithProviders(<TaskDetailPanel taskId="task_1" />);

    await waitFor(() => {
      expect(screen.getByLabelText("Close panel")).toBeInTheDocument();
    });
  });
});

describe("PhaseProgress", () => {
  it("highlights current phase", () => {
    renderWithProviders(<PhaseProgress currentPhase="implement" />);

    const implementEl = screen.getByText("implement");
    expect(implementEl.closest("[data-active]")).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("marks completed phases", () => {
    renderWithProviders(<PhaseProgress currentPhase="implement" />);

    const researchEl = screen.getByText("research");
    expect(researchEl.closest("[data-completed]")).toHaveAttribute(
      "data-completed",
      "true",
    );
  });
});
