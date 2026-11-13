import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor, within } from "../test-utils.js";
import { fireEvent } from "@testing-library/react";

const { useProjects, usePipelines, usePipeline, usePipelineDiff, get, post } = vi.hoisted(() => ({
  useProjects: vi.fn(), usePipelines: vi.fn(), usePipeline: vi.fn(), usePipelineDiff: vi.fn(), get: vi.fn(), post: vi.fn(),
}));
vi.mock("../api/client.js", () => ({ api: { get, post } }));
vi.mock("../hooks/useProjects.js", () => ({ useProjects }));
vi.mock("../hooks/usePipelines.js", () => ({ usePipelines, usePipeline, usePipelineDiff }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ to, params, hash, children, ...props }: { to: string; params?: Record<string, string>; hash?: string; children: React.ReactNode }) =>
    <a href={`${Object.entries(params ?? {}).reduce((url, [key, value]) => url.replace(`$${key}`, value), to)}${hash ? `#${hash}` : ""}`} {...props}>{children}</a>,
}));
import { Route } from "../routes/index.js";

const RepositoryChooser = (Route as unknown as { component: React.ComponentType }).component;
const project = { id: "proj-1", name: "My repo", slug: "my-repo", homeDir: "/tmp/my-repo", active: true };
const pipeline = (id: string, status: string, createdAt: string) => ({ id, projectId: project.id, name: id, status, createdAt });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useProjects.mockReturnValue({ data: [project], isLoading: false, isError: false });
  usePipelines.mockReturnValue({ data: [], isError: false });
  usePipeline.mockReturnValue({ data: undefined });
  usePipelineDiff.mockReturnValue({ data: undefined, isLoading: true, isError: false });
  get.mockResolvedValue({ ready: true, branch: "main", baseBranch: "main" });
});

describe("repository chooser progress", () => {
  it("carries a feature request into the selected repository without starting an agent", async () => {
    localStorage.setItem("orch8:feature-draft:my-repo", JSON.stringify({ feature: "Old request", planner: "feature-planner", branchName: "feat/old", filePaths: ["old.ts"] }));
    const { user } = renderWithProviders(<RepositoryChooser />);
    const input = screen.getByRole("textbox", { name: "Describe a new feature for My repo" });
    expect(input).toHaveValue("Old request");
    await user.clear(input);
    await user.type(input, "Add a useful usage example");
    expect(JSON.parse(localStorage.getItem("orch8:feature-draft:proj-1")!)).toMatchObject({ feature: "Add a useful usage example", planner: "feature-planner", branchName: "", filePaths: [] });
    expect(localStorage.getItem("orch8:feature-draft:my-repo")).toBeNull();
    const link = screen.getByRole("link", { name: "Continue to plan setup" });
    expect(link).toHaveAttribute("href", "/projects/my-repo/pipelines#new-feature");
    await user.click(link);
    expect(JSON.parse(localStorage.getItem("orch8:feature-draft:proj-1")!)).toMatchObject({ feature: "Add a useful usage example", planner: "feature-planner" });
    expect(get).toHaveBeenCalledWith("/projects/proj-1/feature-branch");
  });

  it("keeps the request when leaving via the repository link rather than the continue button", async () => {
    const { user } = renderWithProviders(<RepositoryChooser />);
    await user.type(screen.getByRole("textbox", { name: "Describe a new feature for My repo" }), "Add setup guide");
    expect(JSON.parse(localStorage.getItem("orch8:feature-draft:proj-1")!)).toMatchObject({ feature: "Add setup guide" });
    expect(screen.getByRole("link", { name: /My repo.*Open feature workflows/ })).toHaveAttribute("href", "/projects/my-repo/pipelines");
  });

  it("puts the current workflow decision before new feature setup, while keeping the feature form visible", () => {
    usePipelines.mockReturnValue({ data: [pipeline("plan-1", "running", "2026-11-08T01:00:00Z")], isError: false });
    usePipeline.mockReturnValue({ data: { steps: [{ id: "plan-step", label: "Plan", status: "awaiting_verification" }] } });
    renderWithProviders(<RepositoryChooser />);
    const card = within(screen.getByRole("list", { name: "Selected repository details" })).getAllByRole("listitem")[0];
    const current = within(card).getByRole("region", { name: "Unfinished workflow for My repo" });
    const readiness = within(card).getByRole("region", { name: "Runtime readiness for My repo" });
    const form = within(card).getByRole("region", { name: "New feature for My repo" });
    const repositoryLink = within(card).getByRole("link", { name: /My repo.*Open feature workflows/ });
    expect(current.compareDocumentPosition(repositoryLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(current.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(form.compareDocumentPosition(readiness) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(current).getByRole("link", { name: "Review plan now" })).toHaveAttribute("href", "/projects/my-repo/pipelines/plan-1#workflow-step-plan-step");
    expect(within(form).getByRole("textbox", { name: "Describe a new feature for My repo" })).toBeVisible();
  });
  it("leads with the request and plan setup on a ready checkout with no unfinished work", async () => {
    localStorage.setItem("orch8:feature-draft:proj-1", JSON.stringify({ feature: "Add usage instructions" }));
    renderWithProviders(<RepositoryChooser />);
    const card = within(screen.getByRole("list", { name: "Selected repository details" })).getAllByRole("listitem")[0];
    const form = within(card).getByRole("region", { name: "New feature for My repo" });
    const repositoryLink = within(card).getByRole("link", { name: /My repo.*Open feature workflows/ });
    expect(form.compareDocumentPosition(repositoryLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(form).getByRole("textbox", { name: "Describe a new feature for My repo" })).toHaveValue("Add usage instructions");
    expect(await within(form).findByRole("link", { name: "Continue to plan setup" })).toHaveAttribute("href", "/projects/my-repo/pipelines#new-feature");
    expect(screen.getByText("Checkout clean on base · main")).toBeInTheDocument();
  });
  it("blocks new setup while another workflow is unfinished, even on a clean checkout", async () => {
    localStorage.setItem("orch8:feature-draft:proj-1", JSON.stringify({ feature: "Add setup guide" }));
    usePipelines.mockReturnValue({ data: [pipeline("plan-1", "running", "2026-11-08T01:00:00Z")], isError: false });
    const { user } = renderWithProviders(<RepositoryChooser />);
    const link = await screen.findByText("Continue to plan setup");
    expect(link).toHaveAttribute("aria-disabled", "true");
    await user.click(link);
    expect(screen.getByText("Finish or inspect the unfinished workflow before starting another feature.")).toBeInTheDocument();
  });
  it("retains focus on plan setup while checkout readiness refreshes", async () => {
    localStorage.setItem("orch8:feature-draft:proj-1", JSON.stringify({ feature: "Add setup guide" }));
    renderWithProviders(<RepositoryChooser />);
    const link = await screen.findByRole("link", { name: "Continue to plan setup" });
    link.focus();
    expect(link).toHaveFocus();
    let resolveCheckout!: (result: { ready: boolean; branch: string; baseBranch: string }) => void;
    get.mockReturnValueOnce(new Promise(resolve => { resolveCheckout = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh checkout status" }));
    await waitFor(() => expect(link).toHaveAttribute("aria-disabled", "true"));
    expect(link).toHaveFocus();
    resolveCheckout({ ready: true, branch: "main", baseBranch: "main" });
    await waitFor(() => expect(link).toHaveAttribute("aria-disabled", "false"));
  });
  it("keeps the feature input focused when an unfinished workflow appears", async () => {
    const { rerender, user } = renderWithProviders(<RepositoryChooser />);
    const input = screen.getByRole("textbox", { name: "Describe a new feature for My repo" });
    await user.type(input, "Add setup guide");
    expect(input).toHaveFocus();
    usePipelines.mockReturnValue({ data: [pipeline("plan-1", "running", "2026-11-08T01:00:00Z")], isError: false });
    rerender(<RepositoryChooser />);
    expect(screen.getByRole("textbox", { name: "Describe a new feature for My repo" })).toBe(input);
    expect(input).toHaveFocus();
    expect(screen.getByRole("region", { name: "Unfinished workflow for My repo" })).toBeInTheDocument();
  });
  it("does not offer plan setup until checkout readiness has been confirmed", async () => {
    let resolveCheckout!: (result: { ready: boolean; branch: string; baseBranch: string }) => void;
    get.mockReturnValue(new Promise(resolve => { resolveCheckout = resolve; }));
    localStorage.setItem("orch8:feature-draft:proj-1", JSON.stringify({ feature: "Add usage instructions" }));
    renderWithProviders(<RepositoryChooser />);
    expect(screen.queryByRole("link", { name: "Continue to plan setup" })).not.toBeInTheDocument();
    expect(screen.getByText("Checking checkout...")).toBeInTheDocument();
    resolveCheckout({ ready: true, branch: "main", baseBranch: "main" });
    expect(await screen.findByRole("link", { name: "Continue to plan setup" })).toBeInTheDocument();
  });
  it("links to every remaining workflow without duplicating the current one", () => {
    usePipelines.mockReturnValue({ data: [pipeline("newer", "running", "2026-11-08T02:00:00Z"), pipeline("older", "failed", "2026-11-08T01:00:00Z")], isError: false });
    renderWithProviders(<RepositoryChooser />);
    expect(within(screen.getByRole("region", { name: "Unfinished workflow for My repo" })).getByRole("link", { name: "Continue newer" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See 1 other unfinished workflow" })).toHaveAttribute("href", "#remaining-workflows");
    expect(within(screen.getByRole("region", { name: "Other unfinished workflows for My repo" })).getByRole("link", { name: "Continue older" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Continue newer" })).toHaveLength(1);
  });
  it("shows live checkout readiness before opening a repository", async () => {
    renderWithProviders(<RepositoryChooser />);
    expect(await screen.findByText("Checkout clean on base · main")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/projects/proj-1/feature-branch");
  });

  it("warns about Orch8's pending ignore change instead of calling that checkout clean", async () => {
    get.mockResolvedValue({ ready: true, branch: "main", baseBranch: "main", note: "Orch8's generated .gitignore will remain uncommitted." });
    renderWithProviders(<RepositoryChooser />);
    expect(await screen.findByText("Ready on base (Orch8 ignore change pending) · main")).toBeInTheDocument();
    expect(screen.queryByText(/Checkout clean on base/)).not.toBeInTheDocument();
  });

  it("checks the real Codex sandbox without a model run or changing the checkout", async () => {
    post.mockResolvedValue({ ok: false, message: "Codex sandbox cannot run commands: bubblewrap could not initialize its network namespace (Failed RTM_NEWADDR: Operation not permitted)" });
    const { user } = renderWithProviders(<RepositoryChooser />);
    const readiness = within(screen.getByRole("region", { name: "Runtime readiness for My repo" }));
    expect(readiness.getByRole("button", { name: "Check Codex sandbox (free)" })).toBeVisible();
    await user.click(readiness.getByRole("button", { name: "Check Codex sandbox (free)" }));
    expect(post).toHaveBeenCalledWith("/adapter/codex_local/test-environment", {
      config: { sandbox: "workspace-write", dangerouslyBypassApprovalsAndSandbox: false, sandboxOnly: true },
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Codex sandbox cannot run commands");
    expect(screen.getByRole("complementary", { name: /Codex.*recovery/ })).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("checks Claude in the selected checkout without preparing a branch or approving runtime", async () => {
    post.mockResolvedValue({ ok: false, message: "Claude authentication expired. Re-authenticate with the Claude CLI before retrying the runtime check." });
    const { user } = renderWithProviders(<RepositoryChooser />);
    const readiness = within(screen.getByRole("region", { name: "Runtime readiness for My repo" }));
    expect(readiness.getByRole("button", { name: "Check Claude in this repository (may cost)" })).toBeVisible();
    await user.click(readiness.getByRole("button", { name: "Check Claude in this repository (may cost)" }));
    expect(post).toHaveBeenCalledWith("/adapter/claude_local/test-environment", {
      projectId: project.id, config: { dangerouslySkipPermissions: false },
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Claude authentication expired");
    expect(screen.getByRole("complementary", { name: "Claude authentication recovery" })).toHaveTextContent("claude auth login");
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("warns when existing feature work occupies the checkout", async () => {
    get.mockResolvedValue({ ready: false, branch: "feat/work", baseBranch: "main", reason: "Check out the configured default branch 'main' before preparing a feature branch." });
    renderWithProviders(<RepositoryChooser />);
    expect(await screen.findByText(/On feat\/work · Check out the configured default branch/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /My repo.*Open feature workflows/ })).toBeInTheDocument();
  });

  it("returns an idle clean feature checkout to base from the chooser", async () => {
    get.mockResolvedValueOnce({ ready: false, branch: "feat/work", baseBranch: "main", reason: "Check out the configured default branch 'main' before preparing a feature branch." })
      .mockResolvedValue({ ready: true, branch: "main", baseBranch: "main" });
    post.mockResolvedValue({ ready: true, branch: "main", baseBranch: "main" });
    const { user } = renderWithProviders(<RepositoryChooser />);
    await user.click(await screen.findByRole("button", { name: "Return to main" }));
    expect(post).toHaveBeenCalledWith("/projects/proj-1/return-to-base", {});
    expect(await screen.findByText("Checkout clean on base · main")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Return to main" })).not.toBeInTheDocument();
  });

  it("shows a blocked return without claiming the checkout changed", async () => {
    get.mockResolvedValue({ ready: false, branch: "feat/work", baseBranch: "main", reason: "Finish existing work." });
    post.mockRejectedValue(new Error(JSON.stringify({ message: "Commit or remove working changes first." })));
    const { user } = renderWithProviders(<RepositoryChooser />);
    await user.click(await screen.findByRole("button", { name: "Return to main" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Commit or remove working changes first.");
    expect(screen.getByText(/On feat\/work/)).toBeInTheDocument();
  });

  it("does not claim readiness when the checkout cannot be checked", async () => {
    get.mockRejectedValue(new Error("Unavailable"));
    localStorage.setItem("orch8:feature-draft:proj-1", JSON.stringify({ feature: "Keep my request" }));
    renderWithProviders(<RepositoryChooser />);
    await waitFor(() => expect(screen.getByText(/Checkout status unavailable/)).toBeInTheDocument());
    expect(screen.queryByText(/Checkout clean on base/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Continue to plan setup" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Describe a new feature for My repo" })).toHaveValue("Keep my request");
  });

  it("removes a previous ready claim when a manual refresh fails", async () => {
    get.mockResolvedValueOnce({ ready: true, branch: "main", baseBranch: "main" }).mockRejectedValueOnce(new Error("Unavailable"));
    const { user } = renderWithProviders(<RepositoryChooser />);
    expect(await screen.findByText("Checkout clean on base · main")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh checkout status" }));
    await waitFor(() => expect(screen.getByText(/Checkout status unavailable/)).toBeInTheDocument());
    expect(screen.queryByText("Checkout clean on base · main")).not.toBeInTheDocument();
  });

  it("links directly to an active plan awaiting a decision ahead of a later failed workflow", () => {
    usePipelines.mockReturnValue({ data: [
      pipeline("failed-2", "failed", "2026-11-08T02:00:00Z"),
      pipeline("plan-1", "running", "2026-11-08T01:00:00Z"),
      pipeline("done-3", "completed", "2026-11-08T03:00:00Z"),
    ], isError: false });
    usePipeline.mockImplementation((id: string) => ({ data: { steps: [{ label: id === "plan-1" ? "Plan" : "Implement", status: id === "plan-1" ? "awaiting_verification" : "failed" }] } }));
    renderWithProviders(<RepositoryChooser />);
    expect(screen.getByText("Your decision needed: review plan")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue plan-1" })).toHaveAttribute("href", "/projects/my-repo/pipelines/plan-1");
    expect(screen.getByRole("link", { name: "Continue failed-2" })).toHaveAttribute("href", "/projects/my-repo/pipelines/failed-2");
    expect(usePipeline).toHaveBeenCalledWith("plan-1", true);
    expect(screen.queryByRole("link", { name: /Review plan now/ })).not.toBeInTheDocument(); // No step ID: do not invent an anchor.
  });

  it("links straight to the recorded plan or failed step without starting another run", () => {
    usePipelines.mockReturnValue({ data: [
      pipeline("plan-1", "running", "2026-11-08T01:00:00Z"),
      pipeline("failed-2", "failed", "2026-11-08T02:00:00Z"),
    ], isError: false });
    usePipeline.mockImplementation((id: string) => ({ data: { steps: [{
      id: id === "plan-1" ? "plan-step" : "implement-step",
      label: id === "plan-1" ? "Plan" : "Implement",
      status: id === "plan-1" ? "awaiting_verification" : "failed",
    }] } }));
    renderWithProviders(<RepositoryChooser />);
    expect(screen.getByRole("link", { name: "Review plan now" })).toHaveAttribute("href", "/projects/my-repo/pipelines/plan-1#workflow-step-plan-step");
    expect(screen.getByRole("link", { name: "Inspect failed implement" })).toHaveAttribute("href", "/projects/my-repo/pipelines/failed-2#workflow-step-implement-step");
  });

  it("links to the failed step rather than a later pending review", () => {
    usePipelines.mockReturnValue({ data: [pipeline("failed-2", "failed", "2026-11-08T02:00:00Z")], isError: false });
    usePipeline.mockReturnValue({ data: { steps: [
      { id: "implement-step", label: "Implement", status: "failed" },
      { id: "review-step", label: "Independent review", status: "pending" },
    ] } });
    renderWithProviders(<RepositoryChooser />);
    expect(screen.getByRole("link", { name: "Inspect failed implement" })).toHaveAttribute("href", "/projects/my-repo/pipelines/failed-2#workflow-step-implement-step");
    expect(screen.queryByRole("link", { name: /Inspect failed independent review/ })).not.toBeInTheDocument();
  });

  it("shows every active feature and its pending decision instead of hiding an older workflow", () => {
    usePipelines.mockReturnValue({ data: [
      pipeline("newer-2", "running", "2026-11-08T02:00:00Z"),
      pipeline("older-1", "running", "2026-11-08T01:00:00Z"),
    ], isError: false });
    usePipeline.mockImplementation((id: string) => ({ data: { steps: [{ label: "Plan", status: id === "older-1" ? "awaiting_verification" : "running" }] } }));
    renderWithProviders(<RepositoryChooser />);
    expect(screen.getByRole("link", { name: "Continue newer-2" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue older-1" })).toBeInTheDocument();
    expect(screen.getByText("Your decision needed: review plan")).toBeInTheDocument();
  });

  it("keeps completed work discoverable for PR publication without claiming a PR exists", () => {
    usePipelines.mockReturnValue({ data: [
      { ...pipeline("older-done", "completed", "2026-11-08T01:00:00Z"), updatedAt: "2026-11-08T01:00:00Z" },
      { ...pipeline("newer-done", "completed", "2026-11-08T02:00:00Z"), updatedAt: "2026-11-08T02:00:00Z" },
    ], isError: false });
    renderWithProviders(<RepositoryChooser />);
    const links = screen.getAllByRole("link", { name: /Inspect .*done/ });
    expect(links.map(link => link.textContent)).toEqual(["Inspect newer-done", "Inspect older-done"]);
    expect(links[0]).toHaveAttribute("href", "/projects/my-repo/pipelines/newer-done");
    expect(screen.getByText("Completed work: inspect PR status")).toBeInTheDocument();
    expect(screen.getByText(/verify the branch before publishing/)).toBeInTheDocument();
    expect(usePipeline).not.toHaveBeenCalled();
    expect(usePipelineDiff).toHaveBeenCalledExactlyOnceWith("newer-done");
  });

  it.each([
    ["found", { available: true, prLookup: "found", pullRequest: { number: 42, url: "https://github.com/example/repo/pull/42" }, branch: "feat/a", commit: "abc", approvedRevision: { branch: "feat/a", commit: "abc" } }, "PR #42 for this reviewed revision. Inspect its diff and checks."],
    ["none", { available: true, prLookup: "none", branch: "feat/a", commit: "abc", approvedRevision: { branch: "feat/a", commit: "abc" } }, "No PR found for this reviewed revision. Inspect changes and publication requirements."],
    ["changed", { available: true, prLookup: "found", pullRequest: { number: 99 }, branch: "feat/b", commit: "abc", approvedRevision: { branch: "feat/a", commit: "abc" } }, "Checkout differs from this review. Inspect the workflow before publishing or attributing a PR."],
    ["unavailable", { available: true, prLookup: "unavailable", branch: "feat/a", commit: "abc", approvedRevision: { branch: "feat/a", commit: "abc" } }, "PR status unavailable. Inspect the workflow and check GitHub."],
    ["legacy", { available: true, prLookup: "none", branch: "feat/a", commit: "abc", approvedRevision: null }, "Checkout differs from this review. Inspect the workflow before publishing or attributing a PR."],
  ])("gives an honest next step for the latest completed run when PR is %s", async (_case, diff, message) => {
    get.mockResolvedValue({ ready: false, branch: diff.branch, baseBranch: "main" });
    usePipelines.mockReturnValue({ data: [{ ...pipeline("done", "completed", "2026-11-08T01:00:00Z"), updatedAt: "2026-11-08T01:00:00Z" }], isError: false });
    usePipelineDiff.mockReturnValue({ data: diff, isLoading: false, isError: false });
    renderWithProviders(<RepositoryChooser />);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inspect done" })).toHaveAttribute("href", "/projects/my-repo/pipelines/done");
    if (_case === "found") expect(screen.getByRole("link", { name: "Open PR #42" })).toHaveAttribute("href", "https://github.com/example/repo/pull/42");
    else expect(screen.queryByRole("link", { name: /Open PR #/ })).not.toBeInTheDocument();
  });

  it("removes a stale reviewed PR link immediately after returning to base", async () => {
    get.mockResolvedValue({ ready: false, branch: "feat/a", baseBranch: "main" });
    post.mockResolvedValue({ ready: true, branch: "main", baseBranch: "main" });
    usePipelines.mockReturnValue({ data: [{ ...pipeline("done", "completed", "2026-11-08T01:00:00Z"), updatedAt: "2026-11-08T01:00:00Z" }], isError: false });
    usePipelineDiff.mockReturnValue({ data: { available: true, prLookup: "found", pullRequest: { number: 42, url: "https://github.com/example/repo/pull/42" }, branch: "feat/a", commit: "abc", approvedRevision: { branch: "feat/a", commit: "abc" } }, isLoading: false, isError: false });
    const { user } = renderWithProviders(<RepositoryChooser />);
    expect(await screen.findByRole("link", { name: "Open PR #42" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Return to main" }));
    expect(await screen.findByText("Checkout clean on base · main")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open PR #42" })).not.toBeInTheDocument();
    expect(screen.getByText("Checkout differs from this review. Inspect the workflow before publishing or attributing a PR.")).toBeInTheDocument();
  });

  it("does not recommend publishing when checkout has uncommitted edits", async () => {
    get.mockResolvedValue({ ready: false, branch: "feat/a", baseBranch: "main" });
    usePipelines.mockReturnValue({ data: [{ ...pipeline("done", "completed", "2026-11-08T01:00:00Z"), updatedAt: "2026-11-08T01:00:00Z" }], isError: false });
    usePipelineDiff.mockReturnValue({ data: { available: true, prLookup: "none", branch: "feat/a", commit: "abc", approvedRevision: { branch: "feat/a", commit: "abc" }, committedDiff: "diff", workingDiff: "edit" }, isLoading: false, isError: false });
    renderWithProviders(<RepositoryChooser />);
    expect(await screen.findByText("No PR found for this reviewed revision. Inspect changes and publication requirements.")).toBeInTheDocument();
  });

  it("shows implementation rework instead of a prior rejected review", () => {
    usePipelines.mockReturnValue({ data: [pipeline("rework-1", "running", "2026-11-08T01:00:00Z")], isError: false });
    usePipeline.mockReturnValue({ data: { steps: [
      { label: "Implement", status: "pending" }, { label: "Review", status: "failed" },
    ] } });
    renderWithProviders(<RepositoryChooser />);
    expect(screen.getByText("Implement: pending")).toBeInTheDocument();
    expect(screen.queryByText("Review: failed")).not.toBeInTheDocument();
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
    const error = screen.getByText("Workflow status unavailable. Open the repository to check it.");
    const form = screen.getByRole("region", { name: "New feature for My repo" });
    expect(error.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(usePipeline).not.toHaveBeenCalled();
  });
});
