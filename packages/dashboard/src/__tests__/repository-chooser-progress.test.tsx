import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";

const { useProjects, usePipelines, usePipeline } = vi.hoisted(() => ({
  useProjects: vi.fn(), usePipelines: vi.fn(), usePipeline: vi.fn(),
}));
vi.mock("../hooks/useProjects.js", () => ({ useProjects }));
vi.mock("../hooks/usePipelines.js", () => ({ usePipelines, usePipeline }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ to, params, children, ...props }: { to: string; params?: Record<string, string>; children: React.ReactNode }) =>
    <a href={Object.entries(params ?? {}).reduce((url, [key, value]) => url.replace(`$${key}`, value), to)} {...props}>{children}</a>,
}));
import { Route } from "../routes/index.js";

const RepositoryChooser = (Route as unknown as { component: React.ComponentType }).component;
const project = { id: "proj-1", name: "My repo", slug: "my-repo", homeDir: "/tmp/my-repo", active: true };
const pipeline = (id: string, status: string, createdAt: string) => ({ id, projectId: project.id, name: id, status, createdAt });

beforeEach(() => {
  vi.clearAllMocks();
  useProjects.mockReturnValue({ data: [project], isLoading: false, isError: false });
  usePipelines.mockReturnValue({ data: [], isError: false });
  usePipeline.mockReturnValue({ data: undefined });
});

describe("repository chooser progress", () => {
  it("links directly to an active plan awaiting a decision ahead of a later failed workflow", () => {
    usePipelines.mockReturnValue({ data: [
      pipeline("failed-2", "failed", "2026-11-08T02:00:00Z"),
      pipeline("plan-1", "running", "2026-11-08T01:00:00Z"),
      pipeline("done-3", "completed", "2026-11-08T03:00:00Z"),
    ], isError: false });
    usePipeline.mockReturnValue({ data: { steps: [{ label: "Plan", status: "awaiting_verification" }] } });
    renderWithProviders(<RepositoryChooser />);
    expect(screen.getByText("Your decision needed: review plan")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue plan-1" })).toHaveAttribute("href", "/projects/my-repo/pipelines/plan-1");
    expect(usePipeline).toHaveBeenCalledWith("plan-1", true);
  });

  it("identifies a failed workflow and keeps the repository open link", () => {
    usePipelines.mockReturnValue({ data: [pipeline("failed-1", "failed", "2026-11-08T01:00:00Z")], isError: false });
    usePipeline.mockReturnValue({ data: { steps: [{ label: "Implement", status: "failed" }] } });
    renderWithProviders(<RepositoryChooser />);
    expect(screen.getByText("Workflow failed at implement: inspect the run")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /My repo.*Open feature workflows/ })).toHaveAttribute("href", "/projects/my-repo/pipelines");
  });

  it("reports when the selected workflow detail cannot load", () => {
    usePipelines.mockReturnValue({ data: [pipeline("plan-1", "running", "2026-11-08T01:00:00Z")], isError: false });
    usePipeline.mockReturnValue({ data: undefined, isError: true });
    renderWithProviders(<RepositoryChooser />);
    expect(screen.getByText("Current step unavailable. Open the workflow to check its status.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue plan-1" })).toHaveAttribute("href", "/projects/my-repo/pipelines/plan-1");
  });

  it("does not claim there is no work when workflow status cannot load", () => {
    usePipelines.mockReturnValue({ data: undefined, isError: true });
    renderWithProviders(<RepositoryChooser />);
    expect(screen.getByText("Workflow status unavailable. Open the repository to check it.")).toBeInTheDocument();
    expect(usePipeline).toHaveBeenCalledWith(null, true);
  });
});
