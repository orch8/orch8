import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { TaskCard } from "../components/kanban/TaskCard.js";
import type { Task } from "../types.js";

const mockTask: Task = {
  id: "task_longpress",
  title: "Long-press target",
  taskType: "quick",
  assignee: "engineer",
  priority: "high",
  column: "backlog",
  projectId: "proj_1",
} as Task;

describe("TaskCard long-press", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires onLongPress after the 500ms threshold is reached", () => {
    const onLongPress = vi.fn();
    const onClick = vi.fn();
    const { getByRole } = render(
      <TaskCard task={mockTask} onClick={onClick} onLongPress={onLongPress} />,
    );

    const btn = getByRole("button");
    fireEvent.pointerDown(btn);
    // Advance past the 500ms timer threshold.
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire onLongPress when pointer is released before the threshold", () => {
    const onLongPress = vi.fn();
    const { getByRole } = render(
      <TaskCard task={mockTask} onClick={() => {}} onLongPress={onLongPress} />,
    );

    const btn = getByRole("button");
    fireEvent.pointerDown(btn);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.pointerUp(btn);
    // Make sure any residual timer wouldn't still fire.
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("cancels the pending long-press on pointerCancel", () => {
    const onLongPress = vi.fn();
    const { getByRole } = render(
      <TaskCard task={mockTask} onClick={() => {}} onLongPress={onLongPress} />,
    );

    const btn = getByRole("button");
    fireEvent.pointerDown(btn);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.pointerCancel(btn);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("does nothing on pointerDown when onLongPress is not provided", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <TaskCard task={mockTask} onClick={onClick} />,
    );
    const btn = getByRole("button");
    // Should not throw and should not schedule any timer work.
    fireEvent.pointerDown(btn);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // (No assertion on onLongPress — there's no handler. Nothing should blow up.)
    expect(onClick).not.toHaveBeenCalled();
  });
});
