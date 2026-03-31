import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import { TaskActions } from "../components/task-detail/TaskActions.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

describe("TaskActions", () => {
  it("shows Mark Complete for in_progress tasks", () => {
    renderWithProviders(
      <TaskActions taskId="task_1" column="in_progress" taskType="quick" brainstormStatus={null} />,
    );
    expect(screen.getByText("Mark Complete")).toBeInTheDocument();
  });

  it("shows Spawn Verifier for review tasks", () => {
    renderWithProviders(
      <TaskActions taskId="task_1" column="review" taskType="quick" brainstormStatus={null} />,
    );
    expect(screen.getByText("Spawn Verifier")).toBeInTheDocument();
  });

  it("shows Convert to Task for brainstorm tasks with ready status", () => {
    renderWithProviders(
      <TaskActions taskId="task_1" column="backlog" taskType="brainstorm" brainstormStatus="ready" />,
    );
    expect(screen.getByText("Convert to Quick")).toBeInTheDocument();
    expect(screen.getByText("Convert to Complex")).toBeInTheDocument();
  });

  it("hides actions when not applicable", () => {
    renderWithProviders(
      <TaskActions taskId="task_1" column="done" taskType="quick" brainstormStatus={null} />,
    );
    expect(screen.queryByText("Mark Complete")).not.toBeInTheDocument();
    expect(screen.queryByText("Spawn Verifier")).not.toBeInTheDocument();
  });
});
