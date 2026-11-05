import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishPipelinePr, type PublishCommand } from "../services/pipeline-pr.service.js";

const repo = { homeDir: "", repoUrl: "https://github.com/orch8/orch8.git", defaultBranch: "v2" };
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
    "git push --set-upstream origin feature": "",
    "gh pr create --repo orch8/orch8 --base v2 --head feature --title Build --draft --body Operator-confirmed repository branch from an Orch8 pipeline. Review the exact commit, diff, tests, and checks on GitHub before merging; pipeline review is not bound to this commit.": "https://github.com/orch8/orch8/pull/123\n",
    "gh pr view 123 --repo orch8/orch8 --json url,headRefName,baseRefName,headRefOid": JSON.stringify({ url: "https://github.com/orch8/orch8/pull/123", headRefName: "feature", baseRefName: "v2", headRefOid: "abc123" }),
    ...overrides,
  };
  const run: PublishCommand = vi.fn(async (tool, args) => {
    const command = `${tool} ${args.join(" ")}`;
    calls.push(command);
    if (!(command in responses)) throw new Error(`Unexpected command: ${command}`);
    return responses[command];
  });
  return { run, calls };
}

describe("explicit reviewed pipeline PR publishing", () => {
  it("validates and publishes only the existing committed branch to the configured base", async () => {
    const { run, calls } = commands();
    await expect(publishPipelinePr(repo, "Build", [".orch8/pipelines/p1/Plan.md"], run)).resolves.toEqual({ url: "https://github.com/orch8/orch8/pull/123" });
    expect(calls.indexOf("git push --set-upstream origin feature")).toBeGreaterThan(calls.indexOf("gh pr list --repo orch8/orch8 --head feature --state all --json number,url,headRefOid --limit 100"));
    expect(calls.at(-1)).toContain("gh pr view 123");
  });
  it("allows two Plan revisions and rejects unrelated files in the same artifact directory", async () => {
    const paths = ["Plan.md", "Plan-task1.md", "Plan-task2.md"].map(name => `.orch8/pipelines/p1/${name}`);
    const status = paths.map(path => `?? ${path}\0`).join("");
    const valid = commands({ "git status --porcelain=v1 --untracked-files=all -z": status });
    await expect(publishPipelinePr(repo, "Build", paths, valid.run)).resolves.toHaveProperty("url");
    for (const name of ["unrelated.md", "Plan-unlinked-task.md"]) {
      const invalid = commands({ "git status --porcelain=v1 --untracked-files=all -z": `${status}?? .orch8/pipelines/p1/${name}\0` });
      await expect(publishPipelinePr(repo, "Build", paths, invalid.run)).rejects.toThrow("Commit or remove");
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
    await expect(publishPipelinePr(repo, "Build", [".orch8/pipelines/p1/Plan.md"], run)).rejects.toThrow();
    expect(calls.some(c => c.includes(" push ") || c.includes(" pr create "))).toBe(false);
  });
});
