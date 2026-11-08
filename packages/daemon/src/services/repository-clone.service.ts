import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstat, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { featureBranchReadiness, inspectRepository } from "./feature-branch.service.js";

const exec = promisify(execFile);
let cloning = false;

export class CloneError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function parseGitHubUrl(value: string): { url: string; folder: string } {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9_][A-Za-z0-9_.-]*?)(?:\.git)?$/.exec(value);
  if (!match || match[2] === "." || match[2] === ".." || match[2].startsWith("-"))
    throw new CloneError(400, "Enter a GitHub HTTPS URL like https://github.com/owner/repo.git (without credentials or extra paths).");
  return { url: value, folder: match[2] };
}

export function publicCloneEnvironment(isolatedHome: string, inherited: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...Object.fromEntries(Object.entries(inherited).filter(([key]) => !key.startsWith("GIT_"))),
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0",
    HOME: isolatedHome, XDG_CONFIG_HOME: isolatedHome, CURL_HOME: isolatedHome,
    GCM_INTERACTIVE: "never", GIT_ASKPASS: "/bin/false", GIT_LFS_SKIP_SMUDGE: "1" };
}

/** Reserve the destination before invoking Git. Never clone into an existing path. */
export async function cloneGitHubRepository(url: string, parentDir: string) {
  const parsed = parseGitHubUrl(url);
  if (!parentDir || parentDir.length > 4096 || !parentDir.startsWith("/") || parentDir.includes("\0"))
    throw new CloneError(400, "Choose an existing absolute local parent directory.");
  if (cloning) throw new CloneError(409, "A repository clone is already in progress. Wait for it to finish.");
  cloning = true;
  let destination = "";
  let reserved = false;
  let cloneCompleted = false;
  let isolatedHome = "";
  try {
    const parent = await realpath(parentDir).catch(() => { throw new CloneError(400, "Parent directory does not exist or is not accessible."); });
    if (!(await lstat(parent)).isDirectory()) throw new CloneError(400, "Choose a directory as the clone parent.");
    destination = join(parent, basename(parsed.folder));
    try { await mkdir(destination); reserved = true; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new CloneError(409, `The destination ${destination} already exists. Choose another parent or open that checkout instead.`);
      throw new CloneError(400, "Could not create the destination directory. Check parent directory permissions.");
    }
    try {
      // Git's HTTP transport can read ~/.netrc even with credential.helper disabled.
      isolatedHome = await mkdtemp(join(tmpdir(), "orch8-public-clone-"));
      await exec("git", ["-c", "credential.helper=", "-c", "core.hooksPath=/dev/null", "clone", "--", parsed.url, destination], {
        env: publicCloneEnvironment(isolatedHome),
        timeout: 120_000, maxBuffer: 1024 * 1024,
      });
    } catch (error) {
      const detail = String((error as { stderr?: string }).stderr ?? "");
      if (/not found|Repository not found/i.test(detail)) throw new CloneError(422, "GitHub repository not found or not publicly accessible. Check the URL; interactive sign-in is not supported.");
      if (/authentication|could not read Username|permission denied/i.test(detail)) throw new CloneError(422, "This repository needs credentials. Clone a publicly accessible GitHub repository; interactive sign-in is not supported.");
      throw new CloneError(422, "Clone failed. Check the URL, network connection and parent directory, then retry.");
    }
    cloneCompleted = true;
    const inspection = await inspectRepository(destination).catch(() => { throw new CloneError(422, "Clone completed but has no checked-out default branch. Open the checkout manually after fixing its GitHub default branch."); });
    const readiness = await featureBranchReadiness(destination, inspection.branch);
    if (!readiness.ready) throw new CloneError(422, `Clone completed, but the checkout is not ready: ${readiness.reason}`);
    return { homeDir: destination, branch: inspection.branch, origin: inspection.origin };
  } catch (error) {
    // Keep a completed checkout if post-clone inspection failed. Only clean our failed partial clone.
    if (reserved && !cloneCompleted && destination && (await lstat(destination).catch(() => null))?.isDirectory())
      await rm(destination, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  } finally {
    try {
      if (isolatedHome) await rm(isolatedHome, { recursive: true, force: true });
    } finally { cloning = false; }
  }
}
