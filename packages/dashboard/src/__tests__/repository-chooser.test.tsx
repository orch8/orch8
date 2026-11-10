import { beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithProviders, screen } from "../test-utils.js";

const useProjects = vi.fn();
const usePipelines = vi.fn(() => ({ data: [] as Array<{ id: string; name: string; status: string; createdAt: string; updatedAt: string }>, isError: false }));
vi.mock("../hooks/useProjects.js", () => ({ useProjects: () => useProjects() }));
vi.mock("../api/client.js", () => ({ api: { get: vi.fn().mockResolvedValue({ ready: true, branch: "main", baseBranch: "main" }) } }));
vi.mock("../hooks/usePipelines.js", () => ({
  usePipelines: () => usePipelines(),
  usePipeline: () => ({ data: undefined, isError: false }),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => options,
  Link: ({ to, params, children, ...props }: { to: string; params?: { projectSlug: string }; children: React.ReactNode }) =>
    <a href={params ? to.replace("$projectSlug", params.projectSlug) : to} {...props}>{children}</a>,
}));
import { Route } from "../routes/index.js";
const Chooser = (Route as unknown as { component: React.ComponentType }).component;
beforeEach(() => localStorage.clear());

describe("repository chooser", () => {
  it("hands the request to the feature intake under the repository id, not its URL slug", () => {
    localStorage.clear();
    useProjects.mockReturnValue({ data: [{ id: "proj_abc", name: "Demo", slug: "demo", homeDir: "/tmp/demo", active: true }], isLoading: false, isError: false });
    renderWithProviders(<Chooser />);
    fireEvent.change(screen.getByRole("textbox", { name: "Describe a new feature for Demo" }), { target: { value: "Add usage instructions" } });
    expect(JSON.parse(localStorage.getItem("orch8:feature-draft:proj_abc") ?? "null")).toMatchObject({ feature: "Add usage instructions" });
    expect(localStorage.getItem("orch8:feature-draft:demo")).toBeNull();
    expect(screen.getByRole("link", { name: "Continue to plan setup" })).toHaveAttribute("href", "/projects/demo/pipelines");
    localStorage.clear();
  });
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
    expect(localStorage.getItem("orch8:selected-repository")).toBe("2");
    expect(screen.getByRole("link", { name: /Demo/ })).toHaveAttribute("href", "/projects/demo/pipelines");
    expect(screen.queryByRole("link", { name: /Factory/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a repository" }), { target: { value: "/tmp/factory" } });
    expect(screen.getByRole("link", { name: /Factory/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Demo \/work\/demo/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a repository" }), { target: { value: "missing" } });
    expect(screen.getByRole("status")).toHaveTextContent("No repositories match your search.");
  });

  it("restores the last selected repository without showing another repository's feature form", () => {
    localStorage.setItem("orch8:selected-repository", "2");
    useProjects.mockReturnValue({ data: [
      { id: "1", name: "Factory", slug: "factory", homeDir: "/tmp/factory", active: true },
      { id: "2", name: "Demo", slug: "demo", homeDir: "/work/demo", active: true },
    ], isLoading: false, isError: false });
    renderWithProviders(<Chooser />);
    expect(screen.getByRole("button", { name: /Demo \/work\/demo/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "Describe a new feature for Demo" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Describe a new feature for Factory" })).not.toBeInTheDocument();
  });

  it("shows the active workflow before new feature entry and keeps older work accessible", () => {
    useProjects.mockReturnValue({ data: [{ id: "1", name: "Demo", slug: "demo", homeDir: "/tmp/demo", active: true }], isLoading: false, isError: false });
    usePipelines.mockReturnValueOnce({ data: [
      { id: "old", name: "Older task", status: "pending", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
      { id: "new", name: "Current task", status: "running", createdAt: "2026-01-02", updatedAt: "2026-01-02" },
    ], isError: false });
    renderWithProviders(<Chooser />);
    const entry = screen.getByRole("region", { name: "New feature for Demo" });
    const runtime = screen.getByRole("group", { name: "Optional runtime checks for Demo" });
    const active = screen.getByRole("region", { name: "Unfinished workflow for Demo" });
    const older = screen.getByRole("region", { name: "Other unfinished workflows for Demo" });
    expect(active.compareDocumentPosition(entry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(entry.compareDocumentPosition(runtime) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(runtime.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(runtime).toHaveTextContent("Optional early check");
    expect(runtime).not.toHaveAttribute("open");
    expect(screen.getByRole("link", { name: "Continue Current task" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Continue Older task" })).toBeVisible();
  });

  it("offers recovery if repositories cannot load", () => {
    const refetch = vi.fn();
    useProjects.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    renderWithProviders(<Chooser />);
    screen.getByRole("button", { name: "Retry" }).click();
    expect(refetch).toHaveBeenCalledOnce();
  });
});
