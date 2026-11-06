import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile, lstat, mkdir, readFile, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const exec = promisify(execFile);
const env = () => ({ ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
  GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0" });
const gitRaw = async (cwd: string, args: string[]) => (await exec("git", ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", ...args],
  { cwd, env: env(), timeout: 10_000, maxBuffer: 1024 * 1024, encoding: "utf8" })).stdout;
const gitBytes = async (cwd: string, args: string[]) => (await exec("git", ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", ...args],
  { cwd, env: env(), timeout: 10_000, maxBuffer: 1024 * 1024, encoding: "buffer" })).stdout;
const git = async (cwd: string, args: string[]) => (await gitRaw(cwd, args)).trim();

async function onlyGeneratedIgnoreChange(homeDir: string, status: string) {
  if (status !== "?? .gitignore" && status !== " M .gitignore") return false;
  const ignore = `${homeDir}/.gitignore`;
  const stat = await lstat(ignore);
  if (!stat.isFile() || stat.size > 1024 * 1024) return false;
  const content = await readFile(ignore);
  if (status === "?? .gitignore") return content.equals(Buffer.from("# orch8 orchestrator data\n.orch8/\n"));
  const original = await gitBytes(homeDir, ["show", "HEAD:.gitignore"]);
  const suffix = original.length && original.at(-1) !== 10 ? "\n" : "";
  return content.equals(Buffer.concat([original, Buffer.from(`${suffix}\n# orch8 orchestrator data\n.orch8/\n`)]));
}

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
    const status = (await gitRaw(homeDir, ["status", "--porcelain=v1", "--untracked-files=all"])).trimEnd();
    if (status && !(await onlyGeneratedIgnoreChange(homeDir, status))) {
      throw new Error("The repository must be clean (tracked and untracked files) before preparing a feature branch.");
    }
    return { ready: true, branch, baseBranch, note: status ? "Orch8's generated .gitignore will remain uncommitted on the feature branch." : undefined };
  } catch (error) {
    return { ready: false, branch, baseBranch, reason: (error as Error).message.startsWith("Command failed") || (error as Error).message.startsWith("ENOENT")
      ? "Repository is unavailable or has no checked-out HEAD." : (error as Error).message };
  }
}

/** Read-only details for repository setup. Never expose origins with embedded credentials. */
export async function inspectRepository(homeDir: string) {
  const root = await realpath(homeDir);
  const gitRoot = await realpath(await git(homeDir, ["rev-parse", "--show-toplevel"]));
  if (root !== gitRoot) throw new Error("Choose the Git repository root, not a subdirectory.");
  const branch = await git(homeDir, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const origin = await git(homeDir, ["remote", "get-url", "origin"]).catch(() => "");
  const safeOrigin = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)[\w.-]+\/[\w.-]+(?:\.git)?$/.test(origin) ? origin : "";
  return { branch, origin: safeOrigin, originAvailable: !!origin };
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

async function ignoreLocalRuntimeData(homeDir: string) {
  // Keep the configured base branch's tracked files untouched. Git's local
  // exclude also prevents Orch8's runtime directory appearing in new branches.
  const exclude = resolve(homeDir, await git(homeDir, ["rev-parse", "--git-path", "info/exclude"]));
  await mkdir(dirname(exclude), { recursive: true });
  const stat = await lstat(exclude).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (stat && !stat.isFile()) throw new Error("Git's local exclude file is not a regular file.");
  const content = stat ? await readFile(exclude, "utf8") : "";
  if (!content.split(/\r?\n/).includes(".orch8/")) {
    await appendFile(exclude, `${content && !content.endsWith("\n") ? "\n" : ""}.orch8/\n`);
  }
}

/** Switch only to the existing local configured base; never discard or carry work. */
export async function returnToBaseBranch(homeDir: string, baseBranch: string) {
  const root = await realpath(homeDir);
  const gitRoot = await realpath(await git(homeDir, ["rev-parse", "--show-toplevel"]));
  if (root !== gitRoot) throw new Error("Project directory must be the Git repository root.");
  if (!baseBranch || baseBranch.length > 200 || baseBranch.startsWith("-") ||
      !(await git(homeDir, ["check-ref-format", "--branch", baseBranch]).catch(() => ""))) {
    throw new Error("Configured default branch is invalid.");
  }
  const branch = await git(homeDir, ["symbolic-ref", "--quiet", "--short", "HEAD"]).catch(() => "");
  if (!branch) throw new Error("Check out a branch before returning to the configured base.");
  if (branch === baseBranch) throw new Error("Already on the configured default branch.");
  if (!(await git(homeDir, ["show-ref", "--verify", "--quiet", `refs/heads/${baseBranch}`]).then(() => true, () => false))) {
    throw new Error(`Configured default branch '${baseBranch}' is not available locally.`);
  }
  if (await gitRaw(homeDir, ["status", "--porcelain=v1", "--untracked-files=all"])) {
    throw new Error("The repository must be completely clean (including staged and untracked files) before returning to the base branch.");
  }
  try { await git(homeDir, ["switch", "--no-guess", "--no-overwrite-ignore", baseBranch]); }
  catch { throw new Error("Could not switch to the configured base branch. Inspect the repository before retrying."); }
  if (await git(homeDir, ["symbolic-ref", "--quiet", "--short", "HEAD"]) !== baseBranch) {
    throw new Error("Base branch checkout could not be verified. Inspect the repository before retrying.");
  }
  await ignoreLocalRuntimeData(homeDir);
  return { branch: baseBranch, baseBranch };
}
