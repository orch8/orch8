import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import { Sidebar } from "../components/layout/Sidebar.js";
import { SidebarProvider } from "../components/ui/Sidebar.js";

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
  useParams: () => ({ projectSlug: "proj_1" }),
  useNavigate: () => vi.fn(),
  useRouter: () => ({ navigate: vi.fn() }),
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

  it("renders Chat at the top of the nav with no glyph or star", () => {
    renderWithProviders(
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>,
    );
    const chat = screen.getByText("Chat");
    expect(chat).toBeInTheDocument();
    // No leading star/glyph — textContent must be exactly "Chat"
    expect(chat.textContent).toBe("Chat");
  });

  it("renders Briefing in the top nav, pointing at the briefing route", () => {
    renderSidebar();
    const briefing = screen.getByText("Briefing").closest("a");
    expect(briefing).toBeInTheDocument();
    expect(briefing?.getAttribute("href")).toBe("/projects/proj_1/briefing");
  });

  it("does NOT render a Home nav entry", () => {
    renderSidebar();
    // Chat is the project landing; Briefing is its own page. There is no "Home" item.
    expect(screen.queryByText("Home")).not.toBeInTheDocument();
  });

  it("renders WORK section with Board and Pipelines", () => {
    renderSidebar();
    expect(screen.getByText("WORK")).toBeInTheDocument();
    expect(screen.getByText("Board")).toBeInTheDocument();
    expect(screen.getByText("Pipelines")).toBeInTheDocument();
  });

  it("renders SETUP section with Agents and Settings", () => {
    renderSidebar();
    expect(screen.getByText("SETUP")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders MONITOR section with Runs, Errors, Cost, Memory, Activity", () => {
    renderSidebar();
    expect(screen.getByText("MONITOR")).toBeInTheDocument();
    expect(screen.getByText("Runs")).toBeInTheDocument();
    expect(screen.getByText("Errors")).toBeInTheDocument();
    expect(screen.getByText("Cost")).toBeInTheDocument();
    expect(screen.getByText("Memory")).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
  });

  it("removes the SYSTEM nav section", () => {
    renderSidebar();
    expect(screen.queryByText("SYSTEM")).not.toBeInTheDocument();
  });

  it("renders the Daemon link in the sidebar footer, not in nav", () => {
    renderSidebar();
    const daemonLink = screen.getByText(/daemon/i).closest("a");
    expect(daemonLink?.getAttribute("href")).toBe("/daemon");
  });

  it("does NOT render Brainstorms or Skills nav items", () => {
    renderSidebar();
    expect(screen.queryByText("Brainstorms")).not.toBeInTheDocument();
    expect(screen.queryByText("Skills")).not.toBeInTheDocument();
  });

  it("generates project-scoped links for project pages", () => {
    renderSidebar();
    const boardLink = screen.getByText("Board").closest("a");
    expect(boardLink?.getAttribute("href")).toBe("/projects/proj_1/board");
  });
});

function renderSidebar() {
  return renderWithProviders(
    <SidebarProvider>
      <Sidebar />
    </SidebarProvider>,
  );
}
