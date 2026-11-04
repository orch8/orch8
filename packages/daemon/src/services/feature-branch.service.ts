import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpath } from "node:fs/promises";

const exec = promisify(execFile);
const env = () => ({ ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
  GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0" });
const git = async (cwd: string, args: string[]) => (await exec("git", ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", ...args],
  { cwd, env: env(), timeout: 10_000, maxBuffer: 1024 * 1024, encoding: "utf8" })).stdout.trim();

export async function featureBranchReadiness(homeDir: string, baseBranch: string) {
  let branch = "";
  try {
    const root = await realpath(homeDir);
    const gitRoot = await realpath(await git(homeDir, ["rev-parse", "--show-toplevel"]));
    if (root !== gitRoot) throw new Error("Project directory must be the Git repository root.");
    if (!baseBranch || baseBranch.length > 200 || baseBranch.startsWith("-") ||
        !(await git(homeDir, ["check-ref-format", "--branch", baseBranch]).catch(() => ""))) {
      throw new Error("Configured default branch is invalid.");
    }
    branch = await git(homeDir, ["symbolic-ref", "--quiet", "--short", "HEAD"]).catch(() => "");
    if (branch !== baseBranch) throw new Error(`Check out the configured default branch '${baseBranch}' before preparing a feature branch.`);
    if (await git(homeDir, ["status", "--porcelain=v1", "--untracked-files=all"])) {
      throw new Error("The repository must be clean (tracked and untracked files) before preparing a feature branch.");
    }
    return { ready: true, branch, baseBranch };
  } catch (error) {
    return { ready: false, branch, baseBranch, reason: (error as Error).message.startsWith("Command failed") || (error as Error).message.startsWith("ENOENT")
      ? "Repository is unavailable or has no checked-out HEAD." : (error as Error).message };
  }
}

export async function prepareFeatureBranch(homeDir: string, baseBranch: string, name: string) {
  const readiness = await featureBranchReadiness(homeDir, baseBranch);
  if (!readiness.ready) throw new Error(readiness.reason);
  if (!name || name.length > 200 || name === baseBranch || name.startsWith("-") ||
      name.startsWith("refs/") || !/^[a-zA-Z0-9_./-]+$/.test(name) ||
      !(await git(homeDir, ["check-ref-format", "--branch", name]).catch(() => ""))) {
    throw new Error("Enter a valid new feature branch name (not the default branch).");
  }
  for (const ref of [`refs/heads/${name}`, `refs/remotes/origin/${name}`]) {
    if (await git(homeDir, ["show-ref", "--verify", "--quiet", ref]).then(() => true, () => false)) {
      throw new Error(`Branch '${name}' already exists locally or on origin.`);
    }
  }
  // Git's -c creation is atomic with respect to an existing ref. Never switch to an existing branch.
  try { await git(homeDir, ["switch", "--no-track", "-c", name]); }
  catch { throw new Error("Could not create the branch. Check repository state and branch name before retrying."); }
  if (await git(homeDir, ["symbolic-ref", "--quiet", "--short", "HEAD"]) !== name) {
    throw new Error("Branch creation could not be verified. Inspect the repository before retrying.");
  }
  return { branch: name, baseBranch };
}
