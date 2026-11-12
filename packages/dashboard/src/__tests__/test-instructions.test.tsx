import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TestInstructions } from "../components/pipeline/TestInstructions.js";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock("../api/client.js", () => ({ api: { get, post } }));
beforeEach(() => { get.mockReset(); post.mockReset(); });

async function ready() {
  get.mockResolvedValue({ repository: "/tmp/my-repo", script: "node --test test.mjs", packageManager: "pnpm@9.15.0" });
  render(<TestInstructions projectId="project-1" />);
  await screen.findByText(/node --test test.mjs/);
}

describe("operator-supplied repository test output", () => {
  it("reloads the selected workflow's latest stored output and replaces it after an explicit run", async () => {
    const previous = { id: "ptest_old", projectId: "project-1", pipelineId: "pipe_1", repository: "/tmp/my-repo", triggeredBy: "operator", createdAt: "2026-11-12T12:00:00Z",
      command: ["npm", "run", "test"], script: "node test.cjs", exitCode: 1, signal: null,
      timedOut: false, outputTruncated: false, stdout: "old failure", stderr: "old trace",
      revisionBefore: { branch: "feature", commit: "abc", workingTree: "clean" },
      revisionAfter: { branch: "feature", commit: "abc", workingTree: "clean" }, checkoutChanged: false };
    get.mockImplementation((url: string) => url.includes("test-runs/latest") ? Promise.resolve({ run: previous }) :
      Promise.resolve({ repository: "/tmp/my-repo", script: "node test.cjs", packageManager: "npm@10" }));
    post.mockResolvedValue({ ...previous, id: "ptest_new", stdout: "new actual output", exitCode: 0 });
    const view = render(<TestInstructions projectId="project-1" pipelineId="pipe_1" />);
    const evidence = await screen.findByRole("region", { name: "Local repository test run" });
    expect(within(evidence).getByLabelText("Local test stdout")).toHaveTextContent("old failure");
    expect(evidence).toHaveTextContent("pipe_1");
    expect(evidence).toHaveTextContent("operator");
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Run test script in checkout" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/projects/project-1/run-tests", { pipelineId: "pipe_1" }));
    expect(await screen.findByLabelText("Local test stdout")).toHaveTextContent("new actual output");
    view.unmount();
    render(<TestInstructions projectId="project-1" pipelineId="pipe_1" />);
    expect(await screen.findByLabelText("Local test stdout")).toHaveTextContent("old failure");
    expect(get).toHaveBeenCalledWith("/projects/project-1/test-runs/latest?pipelineId=pipe_1");
  });
  it("runs only after clicking and renders command, exit status, stdout and stderr as local operator execution", async () => {
    post.mockResolvedValue({ command: ["npm", "run", "test", "--ignore-scripts"], script: "node --test test.mjs", exitCode: 1,
      signal: null, timedOut: false, outputTruncated: false, stdout: "test failed", stderr: "assertion error",
      revisionBefore: { branch: "feature", commit: "abc123", workingTree: "clean" },
      revisionAfter: { branch: "feature", commit: "abc123", workingTree: "clean" }, checkoutChanged: false });
    await ready();
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Run test script in checkout" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/projects/project-1/run-tests", {}));
    const result = await screen.findByRole("region", { name: "Local repository test run" });
    expect(result).toHaveTextContent("npm run test --ignore-scripts");
    expect(result).toHaveTextContent("Exit code: 1");
    expect(screen.getByLabelText("Local test stdout")).toHaveTextContent("test failed");
    expect(screen.getByLabelText("Local test stderr")).toHaveTextContent("assertion error");
    expect(result).toHaveTextContent("not agent-reviewed or CI evidence");
    expect(result).toHaveTextContent("snapshots match, but they cannot rule out changes made and reverted");
    expect(screen.getByRole("button", { name: "Download local test run" })).toBeEnabled();
  });
  it("downloads the exact local process output with a truthful scope and failure status", async () => {
    post.mockResolvedValue({ command: ["pnpm", "run", "test"], script: "node --test test.mjs", exitCode: 1,
      signal: null, timedOut: false, outputTruncated: true, stdout: "failed assertion", stderr: "stack trace",
      revisionBefore: { branch: "feature", commit: "abc123", workingTree: "clean" },
      revisionAfter: { branch: "other", commit: "def456", workingTree: "dirty" }, checkoutChanged: true });
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local-test");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      await ready();
      fireEvent.click(screen.getByRole("button", { name: "Run test script in checkout" }));
      fireEvent.click(await screen.findByRole("button", { name: "Download local test run" }));
      expect(create).toHaveBeenCalledOnce();
      const blob = create.mock.calls[0][0] as Blob;
      const text = await new Response(blob).text();
      expect(text).toContain("operator-triggered, not agent review or CI");
      expect(text).toContain("Before: branch feature, commit abc123, working tree clean");
      expect(text).toContain("After: branch other, commit def456, working tree dirty");
      expect(text).toContain("Checkout changed during the test; result cannot be attributed unchanged to one revision.");
      expect(screen.getByRole("region", { name: "Local repository test run" })).toHaveTextContent("Checkout changed during the test; result cannot be attributed unchanged to one revision.");
      expect(text).toContain("Checkout path: /tmp/my-repo");
      expect(text).toContain("Exit code: 1");
      expect(text).toContain("Output truncated: true");
      expect(text).toContain("stdout:\nfailed assertion\n\nstderr:\nstack trace");
      expect(click).toHaveBeenCalledOnce();
    } finally { create.mockRestore(); revoke.mockRestore(); click.mockRestore(); }
  });
  it("shows unavailable revision metadata without inventing attribution", async () => {
    post.mockResolvedValue({ command: ["npm", "run", "test", "--ignore-scripts"], script: "node test.cjs", exitCode: 0,
      signal: null, timedOut: false, outputTruncated: false, stdout: "ok", stderr: "",
      revisionBefore: { branch: null, commit: null, workingTree: "unavailable" },
      revisionAfter: { branch: null, commit: null, workingTree: "unavailable" }, checkoutChanged: false });
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Run test script in checkout" }));
    const result = await screen.findByRole("region", { name: "Local repository test run" });
    expect(result).toHaveTextContent("Before: branch unavailable, commit unavailable, working tree unavailable");
    expect(result).toHaveTextContent("Revision information unavailable; this result cannot be attributed to a revision.");
  });
  it("does not treat matching dirty snapshots as proof of an unchanged checkout", async () => {
    post.mockResolvedValue({ command: ["npm", "run", "test", "--ignore-scripts"], script: "node test.cjs", exitCode: 0,
      signal: null, timedOut: false, outputTruncated: false, stdout: "ok", stderr: "",
      revisionBefore: { branch: "feature", commit: "abc123", workingTree: "dirty" },
      revisionAfter: { branch: "feature", commit: "abc123", workingTree: "dirty" }, checkoutChanged: false });
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Run test script in checkout" }));
    const result = await screen.findByRole("region", { name: "Local repository test run" });
    expect(result).toHaveTextContent("Working tree was dirty; unchanged checkout cannot be established and the result is not solely attributable to the recorded commit.");
  });
  it("shows a checkout-busy failure without claiming a test result", async () => {
    post.mockRejectedValue(new Error("repository_busy"));
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Run test script in checkout" }));
    await screen.findByText(/Could not run tests/);
    expect(screen.queryByRole("region", { name: "Local repository test run" })).not.toBeInTheDocument();
  });
  it("offers the declared pnpm command rather than an npm command", async () => {
    await ready();
    expect(screen.getByText("pnpm --config.enable-pre-post-scripts=false run test")).toBeInTheDocument();
    expect(screen.queryByText("npm run test --ignore-scripts")).not.toBeInTheDocument();
  });
  it("does not guess a command for an unsupported package manager", async () => {
    get.mockResolvedValue({ repository: "/tmp/my-repo", script: "node --test test.mjs", packageManager: "yarn@4.1.0" });
    render(<TestInstructions projectId="project-1" />);
    await screen.findByText(/cannot suggest a safe copyable command/);
    expect(screen.queryByRole("button", { name: "Copy command" })).not.toBeInTheDocument();
  });
  it("shows actual supplied text and exit code without presenting it as verified agent or CI evidence", async () => {
    await ready();
    fireEvent.change(screen.getByRole("textbox", { name: "Terminal test output" }), { target: { value: "test failure: expected 2" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Test process exit code" }), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect result" }));
    const result = screen.getByRole("region", { name: "Operator-supplied test result" });
    expect(result).toHaveTextContent("Reported process exit code: 1 (reported failure)");
    expect(screen.getByLabelText("Operator-supplied raw test output")).toHaveTextContent("test failure: expected 2");
    expect(result).toHaveTextContent("not verified by Orch8");
    expect(result).toHaveTextContent("not agent-run evidence, independent review, or CI");
    expect(screen.getByRole("button", { name: "Download test result" })).toBeEnabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Terminal test output" }), { target: { value: "different output" } });
    expect(screen.queryByRole("region", { name: "Operator-supplied test result" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download test result" })).not.toBeInTheDocument();
  });
  it("loads a small local output file and rejects an oversized file", async () => {
    await ready();
    const input = screen.getByLabelText("Load terminal test output file");
    const file = new File(["TAP version 13\n# pass 1"], "test.log", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Terminal test output" })).toHaveValue("TAP version 13\n# pass 1"));
    fireEvent.change(input, { target: { files: [new File(["x".repeat(128 * 1024 + 1)], "large.log")] } });
    expect(screen.getByRole("alert")).toHaveTextContent("exceeds 128 KB");
  });
  it("does not replace a newer pasted result when an older file read finishes", async () => {
    await ready();
    let finish!: (value: string) => void;
    const delayed = new File(["old"], "old.log");
    delayed.text = () => new Promise<string>(resolve => { finish = resolve; });
    fireEvent.change(screen.getByLabelText("Load terminal test output file"), { target: { files: [delayed] } });
    fireEvent.change(screen.getByRole("textbox", { name: "Terminal test output" }), { target: { value: "newer output" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Test process exit code" }), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect result" }));
    finish("old output");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Terminal test output" })).toHaveValue("newer output"));
    expect(screen.getByLabelText("Operator-supplied raw test output")).toHaveTextContent("newer output");
  });
  it("clears old output when a selected file cannot be read", async () => {
    await ready();
    fireEvent.change(screen.getByRole("textbox", { name: "Terminal test output" }), { target: { value: "old output" } });
    const broken = new File(["bad"], "bad.log");
    broken.text = () => Promise.reject(new Error("read failed"));
    fireEvent.change(screen.getByLabelText("Load terminal test output file"), { target: { files: [broken] } });
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Inspect result" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Terminal test output" })).toHaveValue("");
  });
  it("requires an exit code and output before showing a result", async () => {
    await ready();
    const button = screen.getByRole("button", { name: "Inspect result" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Terminal test output" }), { target: { value: "ok" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Test process exit code" }), { target: { value: "success" } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Test process exit code" }), { target: { value: "00" } });
    expect(button).toBeDisabled();
    expect(screen.queryByRole("region", { name: "Operator-supplied test result" })).not.toBeInTheDocument();
  });
});
