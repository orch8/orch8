import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import { TaskMoveMenu } from "../components/kanban/TaskMoveMenu.js";
import { KANBAN_COLUMNS, COLUMN_LABELS, type Task } from "../types.js";

function makeTask(overrides: Partial<Task> = {}): Task {
  const base: Partial<Task> = {
    id: "task_1",
    title: "Implement login",
    taskType: "quick",
    assignee: "engineer",
    priority: "high",
    column: "backlog",
    projectId: "proj_1",
  };
  return { ...base, ...overrides } as Task;
}

describe("TaskMoveMenu", () => {
  it("renders a menu entry for every column other than the task's current column", () => {
    const task = makeTask({ column: "backlog" });
    renderWithProviders(
      <TaskMoveMenu task={task} onMove={() => {}} onClose={() => {}} />,
    );

    const expected = KANBAN_COLUMNS.filter((c) => c !== "backlog").map(
      (c) => COLUMN_LABELS[c],
    );
    for (const label of expected) {
      expect(screen.getByRole("menuitem", { name: label })).toBeInTheDocument();
    }
    // Current column is hidden from the menu.
    expect(
      screen.queryByRole("menuitem", { name: COLUMN_LABELS.backlog }),
    ).not.toBeInTheDocument();
  });

  it("hides a different 'current column' when the task is elsewhere", () => {
    const task = makeTask({ column: "in_progress" });
    renderWithProviders(
      <TaskMoveMenu task={task} onMove={() => {}} onClose={() => {}} />,
    );
    // Only the task's current column should be missing from the menu.
    expect(
      screen.queryByRole("menuitem", { name: COLUMN_LABELS.in_progress }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: COLUMN_LABELS.backlog }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: COLUMN_LABELS.done }),
    ).toBeInTheDocument();
  });

  it("calls onMove with the task id and chosen column when a menu item is clicked", async () => {
    const task = makeTask({ column: "backlog", id: "task_abc" });
    const onMove = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
      <TaskMoveMenu task={task} onMove={onMove} onClose={onClose} />,
    );

    await userEvent.click(
      screen.getByRole("menuitem", { name: COLUMN_LABELS.done }),
    );

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith("task_abc", "done");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    renderWithProviders(
      <TaskMoveMenu task={makeTask()} onMove={() => {}} onClose={onClose} />,
    );
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on an outside click (backdrop)", () => {
    const onClose = vi.fn();
    renderWithProviders(
      <TaskMoveMenu task={makeTask()} onMove={() => {}} onClose={onClose} />,
    );
    // Simulate a mousedown on the document body (outside the menu panel).
    document.body.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true }),
    );
    expect(onClose).toHaveBeenCalled();
  });
});
