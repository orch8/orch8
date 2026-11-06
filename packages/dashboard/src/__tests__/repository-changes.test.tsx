import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RepositoryChanges } from "../components/pipeline/RepositoryChanges.js";

const state = vi.hoisted(() => ({
  projectId: "project-1",
  refresh: vi.fn(),
  data: undefined as undefined | Record<string, unknown>,
  loading: false,
  error: false,
}));
vi.mock("../hooks/usePipelines.js", () => ({
  useRepositoryChanges: (id: string) => {
    state.projectId = id;
    return { data: state.data, isLoading: state.loading, isError: state.error, isFetching: false, refetch: state.refresh };
  },
}));

beforeEach(() => { state.data = undefined; state.loading = false; state.error = false; state.refresh.mockClear(); });

describe("Build repository changes", () => {
  it("shows distinct live diff sections without requiring a workflow and refreshes", () => {
    state.data = { available: true, branch: "feat/live", baseBranch: "v2", committedDiff: "diff --git a/committed.txt b/committed.txt\n@@ -0,0 +1 @@\n+committed\n", workingDiff: "diff --git a/working.txt b/working.txt\n@@ -0,0 +1 @@\n+working\n", untrackedFiles: ["private.txt"], untrackedMore: true, prLookup: "none" };
    render(<RepositoryChanges projectId="project-1" />);
    expect(state.projectId).toBe("project-1");
    expect(screen.getByText("committed.txt")).toBeInTheDocument();
    expect(screen.getByText("working.txt")).toBeInTheDocument();
    expect(screen.getByText("private.txt")).toBeInTheDocument();
    expect(screen.getByText(/more untracked files exist/i)).toBeInTheDocument();
    expect(screen.getByText(/Checked-out branch:/)).toHaveTextContent("feat/live");
    expect(screen.getByText(/No GitHub PR found/)).toBeInTheDocument();
    expect(screen.getByText(/not a workflow artifact/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh repository changes" }));
    expect(state.refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /publish|approve|run/i })).not.toBeInTheDocument();
  });
  it("labels unavailable, loading, error and empty changes without claiming passing checks", () => {
    state.loading = true;
    const view = render(<RepositoryChanges projectId="project-1" />);
    expect(screen.getByText(/Loading repository changes/)).toBeInTheDocument();
    state.loading = false; state.error = true;
    view.rerender(<RepositoryChanges projectId="project-1" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load repository changes");
    state.error = false; state.data = { available: false, reason: "Configured default branch is not available locally." };
    view.rerender(<RepositoryChanges projectId="project-1" />);
    expect(screen.getByText(/Configured default branch is not available locally/)).toBeInTheDocument();
    state.data = { available: true, branch: "main", baseBranch: "main", committedDiff: "", workingDiff: "", untrackedFiles: [], prLookup: "not_applicable" };
    view.rerender(<RepositoryChanges projectId="project-1" />);
    expect(screen.getByText(/No repository changes found/)).toBeInTheDocument();
    expect(screen.getByText(/PR lookup applies to named branches/)).toBeInTheDocument();
  });
  it("does not leave a failed project lookup in a perpetual loading state", () => {
    render(<RepositoryChanges projectError />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load this project");
    expect(screen.queryByText(/Loading repository changes/)).not.toBeInTheDocument();
  });
  it("shows only exact-commit PR checks and distinguishes absent checks from passing", () => {
    state.data = { available: true, branch: "feat/live", baseBranch: "v2", committedDiff: "", workingDiff: "", untrackedFiles: [], prLookup: "found", pullRequest: { number: 19, title: "Real PR", state: "OPEN", url: "https://github.com/orch8/orch8/pull/19", checks: [{ name: "build", status: "FAILURE", url: "https://github.com/orch8/orch8/actions/runs/1" }] } };
    const view = render(<RepositoryChanges projectId="project-1" />);
    expect(screen.getByRole("link", { name: "#19 Real PR" })).toHaveAttribute("href", "https://github.com/orch8/orch8/pull/19");
    expect(screen.getByRole("link", { name: "build: FAILURE" })).toBeInTheDocument();
    state.data = { ...state.data, pullRequest: { ...(state.data.pullRequest as object), checks: [] } };
    view.rerender(<RepositoryChanges projectId="project-1" />);
    expect(screen.getByText(/No checks reported for this commit/)).toBeInTheDocument();
    state.data = { available: true, branch: "feat/live", baseBranch: "v2", committedDiff: "", workingDiff: "", untrackedFiles: [], prLookup: "unavailable" };
    view.rerender(<RepositoryChanges projectId="project-1" />);
    expect(screen.getByText(/PR lookup unavailable/)).toBeInTheDocument();
  });
});
