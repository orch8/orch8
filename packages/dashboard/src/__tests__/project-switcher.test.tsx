import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import { ProjectSwitcher } from "../components/layout/ProjectSwitcher.js";

const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>{children}</a>
  ),
  useNavigate: () => mockNavigate,
  useParams: () => ({ projectSlug: "proj_1" }),
  useRouterState: ({ select }: any) =>
    select
      ? select({ location: { pathname: "/projects/proj_1/board" } })
      : { location: { pathname: "/projects/proj_1/board" } },
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const mockProjects = [
  { id: "proj_1", name: "Alpha", slug: "alpha", active: true },
  { id: "proj_2", name: "Beta", slug: "beta", active: true },
  { id: "proj_3", name: "Gamma", slug: "gamma", active: false },
];

describe("ProjectSwitcher", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockNavigate.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockProjects),
    });
  });

  it("does NOT show All Projects option", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProjectSwitcher />);
    // Wait for projects to load, then open the dropdown
    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Alpha"));
    expect(screen.queryByText("All Projects")).not.toBeInTheDocument();
  });

  it("shows current project name", async () => {
    renderWithProviders(<ProjectSwitcher />);
    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeInTheDocument();
    });
  });

  it("shows archived badge for inactive projects", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProjectSwitcher />);
    // Wait for projects to load, then open the dropdown
    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Alpha"));
    await waitFor(() => {
      expect(screen.getByText("archived")).toBeInTheDocument();
    });
  });
});
