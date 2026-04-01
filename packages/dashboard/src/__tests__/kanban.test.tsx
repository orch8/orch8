import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import { TaskCard } from "../components/kanban/TaskCard.js";
import { KanbanBoard } from "../components/kanban/KanbanBoard.js";
import type { Task } from "../types.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

const mockTask: Partial<Task> = {
  id: "task_1",
  title: "Implement login",
  taskType: "quick",
  assignee: "engineer",
  priority: "high",
  column: "backlog",
  projectId: "proj_1",
  complexPhase: null,
};

describe("TaskCard", () => {
  it("renders task title and type badge", () => {
    renderWithProviders(
      <TaskCard task={mockTask as Task} onClick={() => {}} />,
    );

    expect(screen.getByText("Implement login")).toBeInTheDocument();
    expect(screen.getByText("Quick")).toBeInTheDocument();
  });

  it("renders priority indicator", () => {
    renderWithProviders(
      <TaskCard task={mockTask as Task} onClick={() => {}} />,
    );

    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("renders assignee when present", () => {
    renderWithProviders(
      <TaskCard task={mockTask as Task} onClick={() => {}} />,
    );

    expect(screen.getByText("engineer")).toBeInTheDocument();
  });

  it("shows phase indicator for complex tasks", () => {
    const complexTask = {
      ...mockTask,
      taskType: "complex" as const,
      complexPhase: "implement" as const,
    };
    renderWithProviders(
      <TaskCard task={complexTask as Task} onClick={() => {}} />,
    );

    expect(screen.getByText("implement")).toBeInTheDocument();
  });
});

describe("KanbanBoard", () => {
  it("renders all four columns", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    renderWithProviders(<KanbanBoard projectId="proj_1" />);

    expect(screen.getByText("Backlog")).toBeInTheDocument();
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("places tasks in correct columns", async () => {
    mockFetch.mockImplementation((...args: any[]) => {
      const url = String(args[0] ?? "");
      if (url.includes("/tasks")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { ...mockTask, id: "t1", column: "backlog" },
              { ...mockTask, id: "t2", title: "Done task", column: "done" },
            ]),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    });

    renderWithProviders(<KanbanBoard projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByText("Implement login")).toBeInTheDocument();
      expect(screen.getByText("Done task")).toBeInTheDocument();
    });
  });
});
