import { describe, it, expect, vi } from "vitest";
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

describe("Sidebar", () => {
  it("renders navigation links", () => {
    renderWithProviders(<Sidebar />);

    expect(screen.getByText("Board")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("Runs")).toBeInTheDocument();
    expect(screen.getByText("Memory")).toBeInTheDocument();
    expect(screen.getByText("Costs")).toBeInTheDocument();
  });
});
