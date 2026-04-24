import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import { TopBar } from "../components/layout/TopBar.js";
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
  useParams: () => ({ projectId: "proj_1" }),
  useRouter: () => ({ navigate: vi.fn() }),
}));

describe("TopBar", () => {
  it("renders breadcrumbs from the current pathname", () => {
    renderTopBar();
    expect(screen.getByText("orch8")).toBeInTheDocument();
    expect(screen.getByText("proj_1")).toBeInTheDocument();
    expect(screen.getByText("Board")).toBeInTheDocument();
  });

  it("renders the search input with the ⌘K placeholder", () => {
    renderTopBar();
    expect(
      screen.getByPlaceholderText(/Search\.\.\./),
    ).toBeInTheDocument();
  });

  it("renders the primary action slot when one is provided", () => {
    renderTopBar(<TopBar primaryAction={<button>New task</button>} />);
    expect(screen.getByText("New task")).toBeInTheDocument();
  });

  it("does NOT render a dedicated Chat shortcut button", () => {
    renderTopBar();
    // Chat is reached via the sidebar and via breadcrumbs.
    // Per spec: the top bar has no dedicated Chat button.
    const chatButton = screen
      .queryAllByRole("link")
      .find((el) => el.textContent?.trim() === "Chat");
    expect(chatButton).toBeUndefined();
  });
});

function renderTopBar(ui = <TopBar />) {
  return renderWithProviders(<SidebarProvider>{ui}</SidebarProvider>);
}
