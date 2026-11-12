import { beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders, screen } from "../test-utils.js";
import { api } from "../api/client.js";

const useProjects = vi.fn();
const usePipelines = vi.fn(() => ({ data: [] as Array<{ id: string; name: string; status: string; createdAt: string; updatedAt: string }>, isError: false }));
vi.mock("../hooks/useProjects.js", () => ({ useProjects: () => useProjects() }));
vi.mock("../api/client.js", () => ({ api: { get: vi.fn().mockResolvedValue({ ready: true, branch: "main", baseBranch: "main" }) } }));
vi.mock("../hooks/usePipelines.js", () => ({
  usePipelines: () => usePipelines(),
  usePipeline: () => ({ data: undefined, isError: false }),
}));
vi.mock("../components/pipeline/RepositoryChanges.js", () => ({
  RepositoryChanges: ({ projectId }: { projectId: string }) => <section aria-label="Repository changes">Changes for {projectId}</section>,
}));
vi.mock("../components/pipeline/TestInstructions.js", () => ({
  TestInstructions: ({ projectId }: { projectId: string }) => <section aria-label="Repository test runner">Tests for {projectId}</section>,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => options,
  Link: ({ to, params, children, ...props }: { to: string; params?: { projectSlug: string; pipelineId?: string }; children: React.ReactNode }) =>
    <a href={params ? to.replace("$projectSlug", params.projectSlug).replace("$pipelineId", params.pipelineId ?? "") : to} {...props}>{children}</a>,
}));
import { Route } from "../routes/index.js";
const Chooser = (Route as unknown as { component: React.ComponentType }).component;
beforeEach(() => {
  localStorage.clear();
  usePipelines.mockReset().mockReturnValue({ data: [], isError: false });
  vi.mocked(api.get).mockReset().mockResolvedValue({ ready: true, branch: "main", baseBranch: "main" });
});

describe("repository chooser", () => {
  it("hands the request to the feature intake under the repository id, not its URL slug", async () => {
    localStorage.clear();
    useProjects.mockReturnValue({ data: [{ id: "proj_abc", name: "Demo", slug: "demo", homeDir: "/tmp/demo", active: true }], isLoading: false, isError: false });
    renderWithProviders(<Chooser />);
    fireEvent.change(screen.getByRole("textbox", { name: "Describe a new feature for Demo" }), { target: { value: "Add usage instructions" } });
    expect(JSON.parse(localStorage.getItem("orch8:feature-draft:proj_abc") ?? "null")).toMatchObject({ feature: "Add usage instructions" });
    expect(localStorage.getItem("orch8:feature-draft:demo")).toBeNull();
    expect(await screen.findByRole("link", { name: "Continue to plan setup" })).toHaveAttribute("href", "/projects/demo/pipelines");
    localStorage.clear();
  });
  it("keeps a new request in draft and routes the operator to unfinished work when checkout is not ready", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ ready: false, branch: "feat/existing", baseBranch: "main", reason: "Finish existing work" });
    useProjects.mockReturnValue({ data: [{ id: "proj_abc", name: "Demo", slug: "demo", homeDir: "/tmp/demo", active: true }], isLoading: false, isError: false });
    usePipelines.mockReturnValue({ data: [
      { id: "work", name: "Existing feature", status: "pending", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    ], isError: false });
    renderWithProviders(<Chooser />);
    fireEvent.change(screen.getByRole("textbox", { name: "Describe a new feature for Demo" }), { target: { value: "Add usage instructions" } });
    await waitFor(() => expect(screen.getByText(/New feature setup is paused/)).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "Continue to plan setup" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Resume unfinished workflow" })).toHaveAttribute("href", "/projects/demo/pipelines/work");
    expect(JSON.parse(localStorage.getItem("orch8:feature-draft:proj_abc") ?? "null")).toMatchObject({ feature: "Add usage instructions" });
  });

  it("restores plan setup after a blocked checkout becomes ready", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ ready: false, branch: "feat/existing", baseBranch: "main" });
    useProjects.mockReturnValue({ data: [{ id: "proj_abc", name: "Demo", slug: "demo", homeDir: "/tmp/demo", active: true }], isLoading: false, isError: false });
    renderWithProviders(<Chooser />);
    fireEvent.change(screen.getByRole("textbox", { name: "Describe a new feature for Demo" }), { target: { value: "Add usage instructions" } });
    await waitFor(() => expect(screen.getByText(/New feature setup is paused/)).toBeInTheDocument());
    vi.mocked(api.get).mockResolvedValueOnce({ ready: true, branch: "main", baseBranch: "main" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh checkout status" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Continue to plan setup" })).toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "Describe a new feature for Demo" })).toHaveValue("Add usage instructions");
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

  it("inspects selected checkout changes only when opened and resets on selection", async () => {
    useProjects.mockReturnValue({ data: [
      { id: "1", name: "Factory", slug: "factory", homeDir: "/tmp/factory", active: true },
      { id: "2", name: "Demo", slug: "demo", homeDir: "/tmp/demo", active: true },
    ], isLoading: false, isError: false });
    renderWithProviders(<Chooser />);
    expect(screen.queryByRole("region", { name: "Repository changes" })).not.toBeInTheDocument();
    const summary = screen.getByText("Inspect checkout diff and PR");
    fireEvent.click(summary);
    expect(await screen.findByRole("region", { name: "Repository changes" })).toHaveTextContent("Changes for 1");
    fireEvent.click(screen.getByRole("button", { name: /Demo \/tmp\/demo/ }));
    expect(screen.queryByRole("region", { name: "Repository changes" })).not.toBeInTheDocument();
  });

  it("runs tests only for the selected checkout after the operator opens its test panel", async () => {
    useProjects.mockReturnValue({ data: [
      { id: "1", name: "Factory", slug: "factory", homeDir: "/tmp/factory", active: true },
      { id: "2", name: "Demo", slug: "demo", homeDir: "/tmp/demo", active: true },
    ], isLoading: false, isError: false });
    renderWithProviders(<Chooser />);
    expect(screen.queryByRole("region", { name: "Repository test runner" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Run repository tests"));
    expect(await screen.findByRole("region", { name: "Repository test runner" })).toHaveTextContent("Tests for 1");
    fireEvent.click(screen.getByRole("button", { name: /Demo \/tmp\/demo/ }));
    expect(screen.queryByRole("region", { name: "Repository test runner" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Run repository tests"));
    expect(await screen.findByRole("region", { name: "Repository test runner" })).toHaveTextContent("Tests for 2");
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
    const runtime = screen.getByRole("region", { name: "Runtime readiness for Demo" });
    const active = screen.getByRole("region", { name: "Unfinished workflow for Demo" });
    const older = screen.getByRole("region", { name: "Other unfinished workflows for Demo" });
    expect(active.compareDocumentPosition(entry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(entry.compareDocumentPosition(runtime) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(runtime.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(runtime).toHaveTextContent("Check before starting a workflow");
    expect(runtime.getElementsByTagName("button")).toHaveLength(2);
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
