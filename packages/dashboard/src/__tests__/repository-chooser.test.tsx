import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const useProjects = vi.fn();
vi.mock("../hooks/useProjects.js", () => ({ useProjects: () => useProjects() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => options,
  Link: ({ to, params, children, ...props }: { to: string; params?: { projectSlug: string }; children: React.ReactNode }) =>
    <a href={params ? to.replace("$projectSlug", params.projectSlug) : to} {...props}>{children}</a>,
}));
import { Route } from "../routes/index.js";
const Chooser = (Route as unknown as { component: React.ComponentType }).component;

describe("repository chooser", () => {
  it("lets the operator select an active checkout directly for feature work", () => {
    useProjects.mockReturnValue({ data: [
      { id: "1", name: "Demo", slug: "demo", homeDir: "/tmp/demo", active: true },
      { id: "2", name: "Archived", slug: "old", homeDir: "/tmp/old", active: false },
    ], isLoading: false, isError: false });
    render(<Chooser />);
    expect(screen.getByRole("link", { name: /Demo/ })).toHaveAttribute("href", "/projects/demo/pipelines");
    expect(screen.queryByRole("link", { name: /Archived/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add repository" })).toHaveAttribute("href", "/projects/new");
  });

  it("offers recovery if repositories cannot load", () => {
    const refetch = vi.fn();
    useProjects.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    render(<Chooser />);
    screen.getByRole("button", { name: "Retry" }).click();
    expect(refetch).toHaveBeenCalledOnce();
  });
});
