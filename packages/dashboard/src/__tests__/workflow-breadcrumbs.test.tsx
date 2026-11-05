import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import { Breadcrumbs } from "../components/layout/Breadcrumbs.js";

let pathname = "/projects/proj_1/pipelines/pipe_1";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname } }),
}));

const projects = [
  { id: "proj_1", slug: "factory-demo", name: "Factory demo" },
  { id: "proj_2", slug: "pipelines", name: "Pipeline project" },
];
globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => projects });

describe("workflow breadcrumbs", () => {
  it("names the project on an ID-based workflow permalink", async () => {
    pathname = "/projects/proj_1/pipelines/pipe_1";
    renderWithProviders(<Breadcrumbs />);
    expect(await screen.findByRole("link", { name: "Factory demo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pipelines" })).toBeInTheDocument();
  });

  it("does not rename a section that happens to match the project slug", async () => {
    pathname = "/projects/pipelines/pipelines";
    renderWithProviders(<Breadcrumbs />);
    expect(await screen.findByRole("link", { name: "Pipeline project" })).toBeInTheDocument();
    expect(screen.getByText("Pipelines")).toBeInTheDocument();
  });
});
