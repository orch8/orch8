import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import { TopBar } from "../components/layout/TopBar.js";

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

describe("TopBar", () => {
  it("renders breadcrumbs from the current pathname", () => {
    renderWithProviders(<TopBar />);
    expect(screen.getByText("orch8")).toBeInTheDocument();
    expect(screen.getByText("proj_1")).toBeInTheDocument();
    expect(screen.getByText("Board")).toBeInTheDocument();
  });

  it("renders the search input with the ⌘K placeholder", () => {
    renderWithProviders(<TopBar />);
    expect(
      screen.getByPlaceholderText(/Search\.\.\./),
    ).toBeInTheDocument();
  });

  it("renders the primary action slot when one is provided", () => {
    renderWithProviders(<TopBar primaryAction={<button>New task</button>} />);
    expect(screen.getByText("New task")).toBeInTheDocument();
  });

  it("does NOT render a dedicated Chat shortcut button", () => {
    renderWithProviders(<TopBar />);
    // Chat is reached via the sidebar and via breadcrumbs.
    // Per spec: the top bar has no dedicated Chat button.
    const chatButton = screen
      .queryAllByRole("link")
      .find((el) => el.textContent?.trim() === "Chat");
    expect(chatButton).toBeUndefined();
  });
});
