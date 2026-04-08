import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import { BoardToolbar } from "../components/kanban/BoardToolbar.js";

describe("BoardToolbar", () => {
  it("renders New Task button", () => {
    renderWithProviders(
      <BoardToolbar projectId="proj_1" onFilterChange={() => {}} />,
    );
    expect(screen.getByText("+ New task")).toBeInTheDocument();
  });

  it("opens task creation modal on click", async () => {
    renderWithProviders(
      <BoardToolbar projectId="proj_1" onFilterChange={() => {}} />,
    );
    await userEvent.click(screen.getByText("+ New task"));
    expect(screen.getByText("Create Task")).toBeInTheDocument();
  });

  it("renders filter controls", () => {
    renderWithProviders(
      <BoardToolbar projectId="proj_1" onFilterChange={() => {}} />,
    );
    expect(screen.getByLabelText("Filter by assignee")).toBeInTheDocument();
  });
});
