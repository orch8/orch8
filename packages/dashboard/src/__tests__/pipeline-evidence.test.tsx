import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import { collectPipelineEvidence, evidenceBlock, EVIDENCE_TEXT_LIMIT } from "../lib/pipelineEvidence.js";
import { DownloadEvidence } from "../components/pipeline/DownloadEvidence.js";
import { api } from "../api/client.js";

vi.mock("../api/client.js", () => ({ api: { get: vi.fn() } }));
const get = vi.mocked(api.get);
const steps = [
  { id: "plan", label: "Plan", status: "completed", outputFilePath: "plan.md" },
  { id: "impl", label: "Implement", taskId: "task-current", agentId: "builder", status: "running" },
  { id: "review", label: "Independent review", agentId: "reviewer", status: "pending", outputFilePath: "review.md" },
];
function sources() {
  get.mockImplementation(async (path) => {
    if (path === "/pipelines/p1") return { pipeline: { id: "p1", name: "Actual current name", projectId: "project-current", status: "running", currentStep: 2 }, steps };
    if (path.endsWith("/steps/plan/output")) return { path: "plan.md", content: "actual plan" };
    if (path.endsWith("/steps/review/output")) return { path: "review.md", content: "actual review" };
    if (path === "/runs") return [{ id: "run-current", status: "succeeded" }];
    if (path.endsWith("/log")) return { content: "actual raw test output\n" + "x".repeat(50_000), bytes: 50_023 };
    if (path.endsWith("/diff")) return { available: true, branch: "feature", baseBranch: "v2", committedDiff: "committed actual", workingDiff: "working actual", untrackedFiles: ["new.txt"], untrackedMore: true, prLookup: "found", pullRequest: { url: "https://github.com/org/repo/pull/1", state: "OPEN", checks: [{ name: "CI", status: "FAILURE", url: "https://checks/1" }] } };
    throw new Error("unexpected endpoint");
  });
}
beforeEach(() => { get.mockReset(); sources(); });

describe("evidence packet", () => {
  it("bounds content and safely renders embedded Markdown", () => {
    expect(evidenceBlock("```\n# heading\n```", 100)).toBe("    ```\n    # heading\n    ```");
    expect(evidenceBlock("safe\r# forged\r\n## forged too", 100)).toBe("    safe\n    # forged\n    ## forged too");
    expect(evidenceBlock("abcdef", 3)).toContain("first 3 of 6 characters");
    expect(evidenceBlock("")).toContain("[Empty]");
  });
  it("collects fresh actual artifacts, latest task log, diffs and reported checks", async () => {
    const packet = await collectPipelineEvidence("p1");
    for (const value of ["Actual current name", "actual plan", "actual review", "actual raw test output", "committed actual", "working actual", "https://github.com/org/repo/pull/1", "CI: FAILURE", "new.txt", "Tests: UNVERIFIED", "distinct recorded agent IDs", "TRUNCATED"]) expect(packet).toContain(value);
    expect(packet).not.toContain("x".repeat(EVIDENCE_TEXT_LIMIT + 1));
    expect(get).toHaveBeenCalledWith("/runs", { projectId: "project-current", taskId: "task-current", limit: 1 });
    expect(get).toHaveBeenCalledWith("/runs/run-current/log", { projectId: "project-current" });
  });
  it("fails on state refresh instead of exporting stale state", async () => {
    get.mockRejectedValue(new Error("offline"));
    await expect(collectPipelineEvidence("p1")).rejects.toThrow("offline");
    expect(get).toHaveBeenCalledTimes(1);
  });
  it("keeps a partial packet when individual evidence requests fail", async () => {
    get.mockImplementation(async path => {
      if (path === "/pipelines/p1") return { pipeline: { id: "p1", projectId: "proj" }, steps };
      throw new Error("sensitive server error body");
    });
    const packet = await collectPipelineEvidence("p1");
    expect(packet.match(/UNAVAILABLE/g)?.length).toBe(4);
    expect(packet).not.toContain("sensitive server error body");
  });
  it("bounds both diff sections and preserves unavailable raw log provenance", async () => {
    get.mockImplementation(async path => {
      if (path === "/pipelines/p1") return { pipeline: { id: "p1", projectId: "proj" }, steps };
      if (path === "/runs") return [{ id: "missing-log", status: "failed" }];
      if (path.endsWith("/diff")) return { available: true, committedDiff: "c".repeat(45_000), workingDiff: "w".repeat(46_000) };
      throw new Error("not found");
    });
    const packet = await collectPipelineEvidence("p1");
    expect(packet).toContain("first 40000 of 45000 characters");
    expect(packet).toContain("first 40000 of 46000 characters");
    expect(packet).toContain("Latest run for current task only: missing-log");
    expect(packet).toContain("Recorded artifact path: plan.md");
    expect(packet).toContain("Raw log content\n\n[UNAVAILABLE");
  });
  it("marks missing evidence and empty diffs without inventing test results", async () => {
    get.mockImplementation(async path => path.endsWith("/diff") ? { available: true, committedDiff: "", workingDiff: "", prLookup: "none" } : { pipeline: { id: "p1" }, steps: [] });
    const packet = await collectPipelineEvidence("p1");
    expect(packet).toContain("MISSING: no step recorded");
    expect(packet).toContain("MISSING: no implementation task");
    expect(packet).toContain("no checks reported");
    expect(packet).toContain("[Empty]");
  });
});

describe("download control", () => {
  it("only fetches after a click, prevents duplicate clicks and downloads locally", async () => {
    let resolve!: (value: unknown) => void;
    get.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:packet");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderWithProviders(<DownloadEvidence pipelineId="p1" />);
    expect(get).not.toHaveBeenCalled();
    expect(screen.getByText(/Logs can contain secrets/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Download evidence" }));
    expect(screen.getByRole("button", { name: "Preparing evidence..." })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Collecting current evidence");
    expect(get).toHaveBeenCalledTimes(1);
    resolve({ pipeline: { id: "p1", projectId: "proj" }, steps: [] });
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith(expect.any(Blob));
    expect(screen.getByRole("status")).toHaveTextContent("Download requested");
    expect(document.querySelector('a[download]')).toBeNull();
    create.mockRestore(); click.mockRestore();
  });
  it("shows a retryable error if fresh state is unavailable", async () => {
    get.mockRejectedValue(new Error("offline"));
    renderWithProviders(<DownloadEvidence pipelineId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: "Download evidence" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not download evidence");
    expect(screen.getByRole("button", { name: "Download evidence" })).toBeEnabled();
  });
});
