import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import { useUiStore } from "../stores/ui.js";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "../components/layout/Sidebar.js";
import { SidebarProvider } from "../components/ui/Sidebar.js";

const route = vi.hoisted(() => ({ pathname: "/projects/proj_1/board", slug: "proj_1" as string | undefined, mobile: false }));

vi.mock("../hooks/useBreakpoint.js", () => ({
  useBreakpoint: () => ({ isMobile: route.mobile, isNarrow: route.mobile, isDesktop: !route.mobile }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: any) =>
    select
      ? select({ location: { pathname: route.pathname } })
      : { location: { pathname: route.pathname } },
  useParams: () => ({ projectSlug: route.slug }),
  useNavigate: () => vi.fn(),
  useRouter: () => ({ navigate: vi.fn() }),
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("Sidebar", () => {
  beforeEach(() => {
    route.pathname = "/projects/proj_1/board";
    route.slug = "proj_1";
    route.mobile = false;
    useUiStore.setState({ sidebarOpen: true, activeDrawer: null });
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
  });

  it("keeps More closed on Board and opens it with the keyboard", async () => {
    renderSidebar();
    expect(screen.queryByText("Chat")).not.toBeInTheDocument();
    expect(screen.queryByText("Memory")).not.toBeInTheDocument();
    const more = screen.getByRole("button", { name: "More" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    more.focus();
    await userEvent.keyboard("{Enter}");
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Briefing").closest("a")).toHaveAttribute("href", "/projects/proj_1/briefing");
  });

  it.each(["chat/history", "briefing", "memory"])("opens More on deep link %s even collapsed", (suffix) => {
    route.pathname = `/projects/proj_1/${suffix}`;
    useUiStore.setState({ sidebarOpen: false });
    renderWithProviders(<SidebarProvider><Sidebar /></SidebarProvider>);
    expect(screen.getByRole("button", { name: "More" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "More" })).toHaveAttribute("data-active", "true");
    const label = suffix.startsWith("chat") ? "Chat" : suffix === "memory" ? "Memory" : "Briefing";
    expect(screen.getByText(label).closest("a")).toHaveAttribute("data-active", "true");
  });

  it("does not show project-only More without a project", () => {
    route.slug = undefined;
    renderSidebar();
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
    expect(screen.queryByText("Memory")).not.toBeInTheDocument();
  });

  it("calls mobile close when a disclosed link is selected", async () => {
    const close = vi.fn();
    renderWithProviders(<SidebarProvider><Sidebar onClose={close} /></SidebarProvider>);
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    await userEvent.click(screen.getByText("Memory"));
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes the actual mobile drawer without an optional onClose prop", async () => {
    route.mobile = true;
    useUiStore.setState({ activeDrawer: "sidebar" });
    renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    await userEvent.click(screen.getByRole("link", { name: "Memory" }));
    expect(useUiStore.getState().activeDrawer).toBeNull();
  });

  it("does NOT render a Home nav entry", () => {
    renderSidebar();
    // Board is the project landing; there is no separate "Home" item.
    expect(screen.queryByText("Home")).not.toBeInTheDocument();
  });

  it("renders WORK section with Board and Pipelines", () => {
    renderSidebar();
    expect(screen.getByText("WORK")).toBeInTheDocument();
    expect(screen.getByText("Board")).toBeInTheDocument();
    expect(screen.getByText("Pipelines")).toBeInTheDocument();
  });

  it("renders SETUP section with Agents, Skills, and Settings", () => {
    renderSidebar();
    expect(screen.getByText("SETUP")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders MONITOR section with Runs, Errors, Cost, Activity", () => {
    renderSidebar();
    expect(screen.getByText("MONITOR")).toBeInTheDocument();
    expect(screen.getByText("Runs")).toBeInTheDocument();
    expect(screen.getByText("Errors")).toBeInTheDocument();
    expect(screen.getByText("Cost")).toBeInTheDocument();
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

  it("does NOT render Brainstorms nav item", () => {
    renderSidebar();
    expect(screen.queryByText("Brainstorms")).not.toBeInTheDocument();
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
