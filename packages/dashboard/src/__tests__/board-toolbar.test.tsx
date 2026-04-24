import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import { BoardToolbar } from "../components/kanban/BoardToolbar.js";

const navigateMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

describe("BoardToolbar", () => {
  it("renders New Task button", () => {
    renderWithProviders(
      <BoardToolbar projectId="proj_1" onFilterChange={() => {}} />,
    );
    expect(screen.getByText("+ New task")).toBeInTheDocument();
  });

  it("navigates to the task creation page on click", async () => {
    navigateMock.mockClear();
    renderWithProviders(
      <BoardToolbar projectId="proj_1" onFilterChange={() => {}} />,
    );
    await userEvent.click(screen.getByText("+ New task"));
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/projects/$projectId/tasks/new",
      params: { projectId: "proj_1" },
    });
  });

  it("renders filter controls", () => {
    renderWithProviders(
      <BoardToolbar projectId="proj_1" onFilterChange={() => {}} />,
    );
    expect(screen.getByLabelText("Filter by assignee")).toBeInTheDocument();
  });
});
