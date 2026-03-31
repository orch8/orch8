import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import { Sidebar } from "../components/layout/Sidebar.js";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: any) =>
    select
      ? select({ location: { pathname: "/projects/proj_1/board" } })
      : { location: { pathname: "/projects/proj_1/board" } },
  useParams: () => ({ projectId: "proj_1" }),
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("Sidebar", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
  });

  it("renders WORK section first with Board, Brainstorm, Review Queue", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText("WORK")).toBeInTheDocument();
    expect(screen.getByText("Board")).toBeInTheDocument();
    expect(screen.getByText("Brainstorm")).toBeInTheDocument();
    expect(screen.getByText("Review Queue")).toBeInTheDocument();
  });

  it("renders SETUP section with Agents and Settings", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText("SETUP")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("does NOT render Projects nav item (replaced by switcher)", () => {
    renderWithProviders(<Sidebar />);
    const allLinks = screen.getAllByRole("link");
    const projectsNavLink = allLinks.find(
      (link) => link.getAttribute("href") === "/projects"
    );
    expect(projectsNavLink).toBeUndefined();
  });

  it("renders MONITOR section with Runs, Cost, Memory, Activity", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText("MONITOR")).toBeInTheDocument();
    expect(screen.getByText("Runs")).toBeInTheDocument();
    expect(screen.getByText("Cost")).toBeInTheDocument();
    expect(screen.getByText("Memory")).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
  });

  it("renders SYSTEM section with Daemon link", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText("SYSTEM")).toBeInTheDocument();
    expect(screen.getByText("Daemon")).toBeInTheDocument();
  });

  it("generates project-scoped links for project pages", () => {
    renderWithProviders(<Sidebar />);
    const boardLink = screen.getByText("Board").closest("a");
    expect(boardLink?.getAttribute("href")).toBe("/projects/proj_1/board");
  });

  it("generates global links for system pages", () => {
    renderWithProviders(<Sidebar />);
    const daemonLink = screen.getByText("Daemon").closest("a");
    expect(daemonLink?.getAttribute("href")).toBe("/daemon");
  });
});
