import { describe, expect, it } from "vitest";
import { buildCodexExecArgs } from "../../../adapter/codex-local/args-builder.js";

describe("buildCodexExecArgs", () => {
  it("builds fresh exec args with cwd, json, model, and stdin sentinel", () => {
    const args = buildCodexExecArgs(
      { model: "gpt-5.5", sandbox: "workspace-write", modelReasoningEffort: "high" },
      { cwd: "/repo" },
    );

    expect(args).toEqual([
      "exec",
      "--json",
      "--skip-git-repo-check",
      "-C",
      "/repo",
      "-m",
      "gpt-5.5",
      "-s",
      "workspace-write",
      "--dangerously-bypass-approvals-and-sandbox",
      "-c",
      "model_reasoning_effort=high",
      "-",
    ]);
  });

  it("omits fresh-only flags on resume", () => {
    const args = buildCodexExecArgs(
      {
        model: "gpt-5.4",
        sandbox: "workspace-write",
        profile: "work",
        search: true,
        addDirs: ["/extra"],
      },
      { cwd: "/repo", resumeSessionId: "thread-1" },
    );

    expect(args).toEqual([
      "exec",
      "resume",
      "--json",
      "thread-1",
      "-m",
      "gpt-5.4",
      "--dangerously-bypass-approvals-and-sandbox",
      "--skip-git-repo-check",
      "-",
    ]);
  });

  it("supports disabling unattended bypass", () => {
    const args = buildCodexExecArgs(
      { dangerouslyBypassApprovalsAndSandbox: false },
      { cwd: "/repo" },
    );

    expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(args.at(-1)).toBe("-");
  });
});
