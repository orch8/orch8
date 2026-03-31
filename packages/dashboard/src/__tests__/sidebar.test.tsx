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
      ? select({ location: { pathname: "/" } })
      : { location: { pathname: "/" } },
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("Sidebar", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // notifications query
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
  });

  it("renders Home link", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("renders Setup section with links", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText("SETUP")).toBeInTheDocument();
    // "Projects" appears in both ProjectSwitcher header and nav link
    expect(screen.getByRole("link", { name: "Projects" })).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders Work section with links", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText("WORK")).toBeInTheDocument();
    expect(screen.getByText("Board")).toBeInTheDocument();
    expect(screen.getByText("Brainstorm")).toBeInTheDocument();
    expect(screen.getByText("Review Queue")).toBeInTheDocument();
  });

  it("renders Monitor section with links", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText("MONITOR")).toBeInTheDocument();
    expect(screen.getByText("Runs")).toBeInTheDocument();
    expect(screen.getByText("Cost")).toBeInTheDocument();
    expect(screen.getByText("Memory")).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
  });

  it("renders System section with Daemon link", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText("SYSTEM")).toBeInTheDocument();
    expect(screen.getByText("Daemon")).toBeInTheDocument();
  });

  it("renders notification bell", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByLabelText("Notifications")).toBeInTheDocument();
  });
});
