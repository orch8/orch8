import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import { KanbanBoardTabs } from "../components/kanban/KanbanBoardTabs.js";
import userEvent from "@testing-library/user-event";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

const mockTasks = [
  { id: "t1", title: "Task A", column: "in_progress", projectId: "proj_1", priority: "high", taskType: "quick" },
  { id: "t2", title: "Task B", column: "backlog", projectId: "proj_1", priority: "low", taskType: "quick" },
  { id: "t3", title: "Task C", column: "done", projectId: "proj_1", priority: "medium", taskType: "quick" },
];

describe("KanbanBoardTabs", () => {
  beforeEach(() => {
    mockFetch.mockImplementation((...args: any[]) => {
      const url = String(args[0] ?? "");
      if (url.includes("/tasks")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTasks),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
  });

  it("renders four column tabs", async () => {
    renderWithProviders(<KanbanBoardTabs projectId="proj_1" />);
    await waitFor(() => {
      expect(screen.getByText("BACKLOG")).toBeInTheDocument();
      expect(screen.getByText("BLOCKED")).toBeInTheDocument();
      expect(screen.getByText("IN PROGRESS")).toBeInTheDocument();
      expect(screen.getByText("DONE")).toBeInTheDocument();
    });
  });

  it("defaults to in_progress tab", async () => {
    renderWithProviders(<KanbanBoardTabs projectId="proj_1" />);
    await waitFor(() => {
      // Task A is in_progress and should be visible by default
      expect(screen.getByText("Task A")).toBeInTheDocument();
      // Task B is in backlog, should NOT be visible
      expect(screen.queryByText("Task B")).not.toBeInTheDocument();
    });
  });

  it("switches tabs on click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<KanbanBoardTabs projectId="proj_1" />);
    await waitFor(() => {
      expect(screen.getByText("Task A")).toBeInTheDocument();
    });

    await user.click(screen.getByText("BACKLOG"));
    expect(screen.getByText("Task B")).toBeInTheDocument();
    expect(screen.queryByText("Task A")).not.toBeInTheDocument();
  });

  it("shows task counts in each tab", async () => {
    renderWithProviders(<KanbanBoardTabs projectId="proj_1" />);
    await waitFor(() => {
      // in_progress has 1 task, backlog has 1, done has 1, blocked has 0
      expect(screen.getByTestId("tab-count-in_progress")).toHaveTextContent("1");
      expect(screen.getByTestId("tab-count-backlog")).toHaveTextContent("1");
    });
  });
});
