import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishPipelinePr, type PublishCommand } from "../services/pipeline-pr.service.js";

const repo = { homeDir: "", repoUrl: "https://github.com/orch8/orch8.git", defaultBranch: "v2" };
const revision = { branch: "feature", commit: "abc123" };
beforeAll(async () => { repo.homeDir = await mkdtemp(join(tmpdir(), "orch8-pr-publish-")); });
afterAll(async () => { await rm(repo.homeDir, { recursive: true, force: true }); });
function commands(overrides: Record<string, string> = {}) {
  const calls: string[] = [];
  const responses: Record<string, string> = {
    "git rev-parse --show-toplevel": `${repo.homeDir}\n`,
    "git symbolic-ref --quiet --short HEAD": "feature\n",
    "git check-ref-format --branch feature": "feature\n",
    "git check-ref-format --branch v2": "v2\n",
    "git status --porcelain=v1 --untracked-files=all -z": "?? .orch8/pipelines/p1/Plan.md\0",
    "git remote get-url origin": "git@github.com:orch8/orch8.git\n",
    "git remote get-url --push --all origin": "https://github.com/orch8/orch8.git\n",
    "git rev-parse HEAD": "abc123\n",
    "git rev-list --count refs/remotes/origin/v2..HEAD": "1\n",
    "gh pr list --repo orch8/orch8 --head feature --state all --json number,url,headRefOid --limit 100": "[]",
    "gh auth status": "",
    "git push --set-upstream origin abc123:refs/heads/feature": "",
    "git ls-remote --heads origin refs/heads/feature": "abc123\trefs/heads/feature\n",
    "gh pr view 123 --repo orch8/orch8 --json url,headRefName,baseRefName,headRefOid": JSON.stringify({ url: "https://github.com/orch8/orch8/pull/123", headRefName: "feature", baseRefName: "v2", headRefOid: "abc123" }),
    ...overrides,
  };
  const run: PublishCommand = vi.fn(async (tool, args) => {
    const command = `${tool} ${args.join(" ")}`;
    calls.push(command);
    if (tool === "gh" && args[0] === "pr" && args[1] === "create") return "https://github.com/orch8/orch8/pull/123\n";
    if (!(command in responses)) throw new Error(`Unexpected command: ${command}`);
    return responses[command];
  });
  return { run, calls };
}

describe("explicit reviewed pipeline PR publishing", () => {
  it.each([
    ["changed HEAD", { branch: "feature", commit: "old-head" }],
    ["changed branch", { branch: "other", commit: "abc123" }],
  ])("blocks %s before pushing", async (_label, approved) => {
    const { run, calls } = commands();
    await expect(publishPipelinePr(repo, "Build", [".orch8/pipelines/p1/Plan.md"], run, undefined, approved)).rejects.toThrow(/changed since review acceptance/);
    expect(calls.some(call => call.includes(" push ") || call.includes(" pr create "))).toBe(false);
  });
  it("names the accepted revision without claiming the report or tests were bound to it", async () => {
    const { run, calls } = commands();
    await publishPipelinePr(repo, "Build", [".orch8/pipelines/p1/Plan.md"], run, undefined, revision);
    const body = calls.find(call => call.startsWith("gh pr create"))!;
    expect(body).toContain("Accepted review revision: branch `feature`, commit `abc123`");
    expect(body).toContain("does not prove which code or tests the reviewer inspected");
  });
  it("validates and publishes only the existing committed branch to the configured base", async () => {
    const { run, calls } = commands();
    await expect(publishPipelinePr(repo, "Build", [".orch8/pipelines/p1/Plan.md"], run, undefined, revision)).resolves.toEqual({ url: "https://github.com/orch8/orch8/pull/123" });
    expect(calls.indexOf("git push --set-upstream origin abc123:refs/heads/feature")).toBeGreaterThan(calls.indexOf("gh pr list --repo orch8/orch8 --head feature --state all --json number,url,headRefOid --limit 100"));
    expect(calls.indexOf("git ls-remote --heads origin refs/heads/feature")).toBeLessThan(calls.findIndex(call => call.startsWith("gh pr create")));
    expect(calls.at(-1)).toContain("gh pr view 123");
    expect(calls.find(call => call.startsWith("gh pr create"))).toContain("No test results were supplied");
    expect(calls.find(call => call.startsWith("gh pr create"))).toContain("/compare/v2...abc123");
  });
  it("carries operator-supplied summary and test notes into the draft without claiming they passed", async () => {
    const { run, calls } = commands();
    await publishPipelinePr(repo, "Build", [".orch8/pipelines/p1/Plan.md"], run, { summary: "Adds a search field", tests: "pnpm test: exit 0" }, revision);
    const create = calls.find(call => call.startsWith("gh pr create"));
    expect(create).toContain("Operator summary (not independently verified)");
    expect(create).toContain("Adds a search field");
    expect(create).toContain("Test notes (operator supplied, not verified by Orch8)");
    expect(create).toContain("pnpm test: exit 0");
  });
  it("does not create a PR if the remote branch no longer points to the approved commit", async () => {
    const { run, calls } = commands({ "git ls-remote --heads origin refs/heads/feature": "def456\trefs/heads/feature\n" });
    await expect(publishPipelinePr(repo, "Build", [".orch8/pipelines/p1/Plan.md"], run, undefined, revision)).rejects.toThrow(/remote branch changed/);
    expect(calls).toContain("git push --set-upstream origin abc123:refs/heads/feature");
    expect(calls.some(call => call.startsWith("gh pr create"))).toBe(false);
  });
  it("keeps carriage-return lines inside the unverified operator note", async () => {
    const { run, calls } = commands();
    await publishPipelinePr(repo, "Build", [".orch8/pipelines/p1/Plan.md"], run,
      { summary: "Feature\r## Verified by Orch8\rTests passed", tests: "" }, revision);
    const create = calls.find(call => call.startsWith("gh pr create"))!;
    expect(create).toContain("> Feature\n> ## Verified by Orch8\n> Tests passed");
    expect(create).not.toContain("\r");
  });
  it("allows two Plan revisions and rejects unrelated files in the same artifact directory", async () => {
    const paths = ["Plan.md", "Plan-task1.md", "Plan-task2.md"].map(name => `.orch8/pipelines/p1/${name}`);
    const status = paths.map(path => `?? ${path}\0`).join("");
    const valid = commands({ "git status --porcelain=v1 --untracked-files=all -z": status });
    await expect(publishPipelinePr(repo, "Build", paths, valid.run, undefined, revision)).resolves.toHaveProperty("url");
    for (const name of ["unrelated.md", "Plan-unlinked-task.md"]) {
      const invalid = commands({ "git status --porcelain=v1 --untracked-files=all -z": `${status}?? .orch8/pipelines/p1/${name}\0` });
      await expect(publishPipelinePr(repo, "Build", paths, invalid.run, undefined, revision)).rejects.toThrow("Commit or remove");
      expect(invalid.calls.some(c => c.includes(" push ") || c.includes(" pr create "))).toBe(false);
    }
  });
  it.each([
    ["dirty tree", { "git status --porcelain=v1 --untracked-files=all -z": "?? secret.txt\0" }],
    ["extra pipeline artifact", { "git status --porcelain=v1 --untracked-files=all -z": "?? .orch8/pipelines/p2/Plan.md\0" }],
    ["modified recorded artifact", { "git status --porcelain=v1 --untracked-files=all -z": " M .orch8/pipelines/p1/Plan.md\0" }],
    ["wrong fetch origin", { "git remote get-url origin": "git@github.com:elsewhere/repo.git\n" }],
    ["wrong push URL", { "git remote get-url --push --all origin": "https://github.com/orch8/orch8.git\nssh://evil/repo\n" }],
    ["base branch", { "git symbolic-ref --quiet --short HEAD": "v2\n" }],
    ["no commit beyond base", { "git rev-list --count refs/remotes/origin/v2..HEAD": "0\n" }],
    ["existing PR", { "gh pr list --repo orch8/orch8 --head feature --state all --json number,url,headRefOid --limit 100": "[{\"number\":12,\"url\":\"https://github.com/orch8/orch8/pull/12\",\"headRefOid\":\"abc123\"}]" }],
  ])("blocks %s before any push or PR", async (_name, overrides) => {
    const { run, calls } = commands(overrides);
    await expect(publishPipelinePr(repo, "Build", [".orch8/pipelines/p1/Plan.md"], run, undefined, revision)).rejects.toThrow();
    expect(calls.some(c => c.includes(" push ") || c.includes(" pr create "))).toBe(false);
  });
});
