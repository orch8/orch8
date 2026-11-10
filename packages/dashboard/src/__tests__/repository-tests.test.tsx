import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RepositoryTests } from "../components/pipeline/RepositoryTests.js";

const state = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../api/client.js", () => ({ api: state }));
beforeEach(() => { state.get.mockReset(); state.post.mockReset(); });

it("does not run on load and shows the selected repository's exact script before running", async () => {
  state.get.mockResolvedValue({ available: true, repository: "/repo/one", script: "vitest run" });
  state.post.mockResolvedValue({ repository: "/repo/one", script: "vitest run", exitCode: 1, timedOut: false, stdout: "failure", stderr: "details", stdoutTruncated: false, stderrTruncated: false });
  render(<RepositoryTests projectId="one" />);
  expect(await screen.findByText("vitest run")).toBeInTheDocument();
  expect(screen.getByText("/repo/one")).toBeInTheDocument();
  expect(state.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Run repository tests" }));
  await waitFor(() => expect(state.post).toHaveBeenCalledWith("/projects/one/repository-tests", {}));
  expect(await screen.findByText(/Exit code: 1/)).toBeInTheDocument();
  expect(screen.getByLabelText("Repository test stdout")).toHaveTextContent("failure");
  expect(screen.getByLabelText("Repository test stderr")).toHaveTextContent("details");
  expect(screen.getByText(/Independent manual verification only/)).toBeInTheDocument();
});

it("does not reuse stale results when the selected project changes", async () => {
  state.get.mockImplementation(async path => path.includes("/two/") ? { available: false, repository: "/repo/two" } : { available: true, repository: "/repo/one", script: "echo ok" });
  state.post.mockResolvedValue({ repository: "/repo/one", script: "echo ok", exitCode: 0, timedOut: false, stdout: "ok", stderr: "", stdoutTruncated: false, stderrTruncated: false });
  const view = render(<RepositoryTests projectId="one" />);
  await screen.findByText("echo ok");
  fireEvent.click(screen.getByRole("button", { name: "Run repository tests" }));
  await screen.findByText(/Exit code: 0/);
  view.rerender(<RepositoryTests projectId="two" />);
  await screen.findByText(/No usable root package.json test script/);
  expect(screen.queryByText(/Exit code: 0/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Run repository tests" })).toBeDisabled();
});
