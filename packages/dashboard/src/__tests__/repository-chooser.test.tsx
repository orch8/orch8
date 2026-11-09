import { describe, it, expect, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithProviders, screen } from "../test-utils.js";

const useProjects = vi.fn();
vi.mock("../hooks/useProjects.js", () => ({ useProjects: () => useProjects() }));
vi.mock("../api/client.js", () => ({ api: { get: vi.fn().mockResolvedValue({ ready: true, branch: "main", baseBranch: "main" }) } }));
vi.mock("../hooks/usePipelines.js", () => ({
  usePipelines: () => ({ data: [], isError: false }),
  usePipeline: () => ({ data: undefined, isError: false }),
}));
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
    renderWithProviders(<Chooser />);
    expect(screen.getByRole("link", { name: /Demo/ })).toHaveAttribute("href", "/projects/demo/pipelines");
    expect(screen.queryByRole("link", { name: /Archived/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add repository" })).toHaveAttribute("href", "/projects/new");
  });

  it("selects one checkout and searches names and paths without showing other workflow details", () => {
    useProjects.mockReturnValue({ data: [
      { id: "1", name: "Factory", slug: "factory", homeDir: "/tmp/factory", active: true },
      { id: "2", name: "Demo", slug: "demo", homeDir: "/work/demo", active: true },
    ], isLoading: false, isError: false });
    renderWithProviders(<Chooser />);
    expect(screen.getByRole("link", { name: /Factory/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Demo/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Demo \/work\/demo/ }));
    expect(screen.getByRole("link", { name: /Demo/ })).toHaveAttribute("href", "/projects/demo/pipelines");
    expect(screen.queryByRole("link", { name: /Factory/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a repository" }), { target: { value: "/tmp/factory" } });
    expect(screen.getByRole("link", { name: /Factory/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Demo \/work\/demo/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a repository" }), { target: { value: "missing" } });
    expect(screen.getByRole("status")).toHaveTextContent("No repositories match your search.");
  });

  it("offers recovery if repositories cannot load", () => {
    const refetch = vi.fn();
    useProjects.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    renderWithProviders(<Chooser />);
    screen.getByRole("button", { name: "Retry" }).click();
    expect(refetch).toHaveBeenCalledOnce();
  });
});
