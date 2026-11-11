import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpath } from "node:fs/promises";

const exec = promisify(execFile);
export type PublishCommand = (tool: "git" | "gh", args: string[], cwd: string) => Promise<string>;
export type PrHandoff = { summary: string; tests: string };

export const runPublishCommand: PublishCommand = async (tool, args, cwd) => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = "/dev/null";
  env.GIT_TERMINAL_PROMPT = "0";
  env.GH_PROMPT_DISABLED = "1";
  const command = tool === "git" ? ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", ...args] : args;
  const { stdout } = await exec(tool, command, { cwd, env, timeout: 20_000, maxBuffer: 128 * 1024, encoding: "utf8" });
  return stdout;
};

export function githubSlug(url: string): string | null {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(url.trim());
  return match ? `${match[1]}/${match[2]}`.toLowerCase() : null;
}

/** Never stage, commit, switch branch, or publish unreviewed working-tree files. */
export async function publishPipelinePr(
  project: { homeDir: string; repoUrl: string | null; defaultBranch: string },
  name: string,
  outputPaths: string[],
  run: PublishCommand = runPublishCommand,
  handoff?: PrHandoff,
  approvedRevision?: { branch: string; commit: string },
): Promise<{ url: string }> {
  if (!approvedRevision) throw new Error("This review has no recorded revision. Start a new feature workflow and accept the review before publishing.");
  const { homeDir, defaultBranch } = project;
  const intended = project.repoUrl && githubSlug(project.repoUrl);
  const git = (args: string[]) => run("git", args, homeDir);
  const gh = (args: string[]) => run("gh", args, homeDir);
  // Command injection is avoided by argv, but git refs and CLI flags must still be validated.
  if (!defaultBranch || defaultBranch.startsWith("-") || defaultBranch.length > 200 ||
      !/^[\w./-]+$/.test(defaultBranch) || defaultBranch.includes("..") || defaultBranch.includes("//")) {
    throw new Error("Configured default branch is invalid.");
  }
  const top = (await git(["rev-parse", "--show-toplevel"])).trim();
  if (await realpath(top) !== await realpath(homeDir)) throw new Error("Project directory must be the repository root.");
  const branch = (await git(["symbolic-ref", "--quiet", "--short", "HEAD"])).trim();
  if (!branch || branch.startsWith("-") || branch === defaultBranch || branch.length > 200) throw new Error("Check out a feature branch distinct from the project default branch.");
  if (branch !== approvedRevision.branch) throw new Error("The branch or commit changed since review acceptance. Inspect the current diff and start a new reviewed feature workflow before publishing.");
  const sha = (await git(["rev-parse", "HEAD"])).trim();
  if (sha !== approvedRevision.commit) throw new Error("The branch or commit changed since review acceptance. Inspect the current diff and start a new reviewed feature workflow before publishing.");
  if (!intended) throw new Error("Configure a GitHub repository URL on the project before publishing.");
  await git(["check-ref-format", "--branch", branch]);
  await git(["check-ref-format", "--branch", defaultBranch]);
  const allowedOutputs = new Set(outputPaths.filter(path => /^\.orch8\/pipelines\/[\w-]+\/[^/]+\.md$/.test(path)));
  const clean = async () => (await git(["status", "--porcelain=v1", "--untracked-files=all", "-z"]))
    .split("\0").filter(Boolean).every(row => row.startsWith("?? ") && allowedOutputs.has(row.slice(3)));
  if (!await clean()) throw new Error("Commit or remove changes other than recorded pipeline output files before creating a PR.");
  if (githubSlug(await git(["remote", "get-url", "origin"])) !== intended) throw new Error("Git origin does not match the project repository URL.");
  const pushUrls = (await git(["remote", "get-url", "--push", "--all", "origin"])).trim().split("\n").filter(Boolean);
  if (!pushUrls.length || pushUrls.some(url => githubSlug(url) !== intended)) throw new Error("Git origin push URLs do not all match the project repository URL.");
  const count = (await git(["rev-list", "--count", `refs/remotes/origin/${defaultBranch}..HEAD`])).trim();
  if (!/^\d+$/.test(count) || Number(count) < 1) throw new Error("No committed branch changes ahead of the locally fetched default branch.");
  const listArgs = ["pr", "list", "--repo", intended, "--head", branch, "--state", "all", "--json", "number,url,headRefOid", "--limit", "100"];
  const existing: unknown = JSON.parse(await gh(listArgs));
  if (!Array.isArray(existing) || existing.length >= 100) throw new Error("PR lookup incomplete; check GitHub before publishing.");
  if (existing.length) throw new Error("A PR already exists for this branch. Inspect it on GitHub instead of creating another.");
  await gh(["auth", "status"]);
  // Recheck after network calls so changes made while the user was reviewing cannot be pushed.
  if ((await git(["symbolic-ref", "--quiet", "--short", "HEAD"])).trim() !== branch ||
      (await git(["rev-parse", "HEAD"])).trim() !== sha || !await clean()) {
    throw new Error("The repository changed during preflight; refresh and try again.");
  }
  // Push the approved object, not the mutable local branch name. Another
  // process must not advance the branch between preflight and publication.
  await git(["push", "--set-upstream", "origin", `${sha}:refs/heads/${branch}`]);
  const remoteHead = (await git(["ls-remote", "--heads", "origin", `refs/heads/${branch}`])).trim();
  if (remoteHead !== `${sha}\trefs/heads/${branch}`) {
    throw new Error("The remote branch changed after push. Inspect it on GitHub before creating a PR.");
  }
  const title = name.replace(/[\r\n]/g, " ").trim().slice(0, 200) || "Reviewed pipeline changes";
  const quote = (value: string) => value.trim().replace(/\r\n?/g, "\n").split("\n").map(line => `> ${line}`).join("\n");
  const code = (value: string) => value.replace(/`/g, "\\`");
  const body = [
    "## Review handoff",
    `Branch: \`${code(branch)}\` into \`${code(defaultBranch)}\`. Commit: \`${sha}\`.`,
    `Inspect the [exact committed comparison](https://github.com/${intended}/compare/${encodeURIComponent(defaultBranch)}...${sha}) and GitHub checks before merging.`,
    `Accepted review revision: branch \`${code(approvedRevision.branch)}\`, commit \`${approvedRevision.commit}\`. This records the repository HEAD when the human accepted the independent review; it does not prove which code or tests the reviewer inspected. Check the local workflow evidence before merging.`,
    handoff?.summary.trim() ? `## Operator summary (not independently verified)\n${quote(handoff.summary)}` : "",
    handoff?.tests.trim() ? `## Test notes (operator supplied, not verified by Orch8)\n${quote(handoff.tests)}` : "## Tests\nNo test results were supplied with this PR. Inspect the local implementation run log and GitHub checks.",
  ].filter(Boolean).join("\n\n");
  const output = (await gh(["pr", "create", "--repo", intended, "--base", defaultBranch, "--head", branch,
    "--title", title, "--draft", "--body", body])).trim();
  const match = new RegExp(`^https://github\\.com/${intended.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/pull/([1-9][0-9]*)/?$`, "i").exec(output);
  if (!match) throw new Error("GitHub did not return a verifiable pull request URL; inspect GitHub before retrying.");
  const viewed: unknown = JSON.parse(await gh(["pr", "view", match[1], "--repo", intended,
    "--json", "url,headRefName,baseRefName,headRefOid"]));
  if (!viewed || typeof viewed !== "object" || !('url' in viewed) || viewed.url !== output ||
      !('headRefName' in viewed) || viewed.headRefName !== branch ||
      !('baseRefName' in viewed) || viewed.baseRefName !== defaultBranch ||
      !('headRefOid' in viewed) || viewed.headRefOid !== sha) {
    throw new Error("Created PR could not be verified against the reviewed branch commit; inspect GitHub before retrying.");
  }
  return { url: output };
}
