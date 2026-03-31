import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import { DependencyPicker } from "../components/shared/DependencyPicker.js";
import type { Task } from "../types.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

const mockTasks: Partial<Task>[] = [
  { id: "task_1", title: "Build auth", column: "in_progress", projectId: "proj_1" },
  { id: "task_2", title: "Setup database", column: "done", projectId: "proj_1" },
  { id: "task_3", title: "Build dashboard", column: "backlog", projectId: "proj_1" },
];

describe("DependencyPicker", () => {
  it("renders search input", () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockTasks),
    });
    renderWithProviders(
      <DependencyPicker
        projectId="proj_1"
        selectedIds={[]}
        excludeIds={[]}
        onAdd={() => {}}
      />,
    );
    expect(screen.getByPlaceholderText("Search tasks...")).toBeInTheDocument();
  });

  it("filters tasks by search query", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockTasks),
    });
    renderWithProviders(
      <DependencyPicker
        projectId="proj_1"
        selectedIds={[]}
        excludeIds={[]}
        onAdd={() => {}}
      />,
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const input = screen.getByPlaceholderText("Search tasks...");
    await userEvent.type(input, "auth");

    await waitFor(() => {
      expect(screen.getByText("Build auth")).toBeInTheDocument();
      expect(screen.queryByText("Setup database")).not.toBeInTheDocument();
    });
  });

  it("calls onAdd when a task is clicked", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockTasks),
    });
    const onAdd = vi.fn();
    renderWithProviders(
      <DependencyPicker
        projectId="proj_1"
        selectedIds={[]}
        excludeIds={[]}
        onAdd={onAdd}
      />,
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const input = screen.getByPlaceholderText("Search tasks...");
    await userEvent.type(input, "auth");

    await waitFor(() => {
      expect(screen.getByText("Build auth")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Build auth"));
    expect(onAdd).toHaveBeenCalledWith("task_1");
  });

  it("excludes already-selected and excluded IDs from results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockTasks),
    });
    renderWithProviders(
      <DependencyPicker
        projectId="proj_1"
        selectedIds={["task_1"]}
        excludeIds={["task_2"]}
        onAdd={() => {}}
      />,
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const input = screen.getByPlaceholderText("Search tasks...");
    await userEvent.type(input, "B");

    await waitFor(() => {
      expect(screen.queryByText("Build auth")).not.toBeInTheDocument();
      expect(screen.queryByText("Setup database")).not.toBeInTheDocument();
      expect(screen.getByText("Build dashboard")).toBeInTheDocument();
    });
  });
});
