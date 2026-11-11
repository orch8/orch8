import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TestInstructions } from "../components/pipeline/TestInstructions.js";

const get = vi.hoisted(() => vi.fn());
vi.mock("../api/client.js", () => ({ api: { get } }));

async function ready() {
  get.mockResolvedValue({ repository: "/tmp/my-repo", script: "node --test test.mjs", packageManager: "pnpm@9.15.0" });
  render(<TestInstructions projectId="project-1" />);
  await screen.findByText(/node --test test.mjs/);
}

describe("operator-supplied repository test output", () => {
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
