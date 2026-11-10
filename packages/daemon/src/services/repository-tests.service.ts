import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { join } from "node:path";

const MANIFEST_LIMIT = 64 * 1024;
const OUTPUT_LIMIT = 16 * 1024;
const TEST_TIMEOUT_MS = 120_000;
const active = new Set<string>();

export async function repositoryTestScript(homeDir: string) {
  const repository = await realpath(homeDir);
  let handle;
  try {
    handle = await open(join(repository, "package.json"), constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MANIFEST_LIMIT) throw new Error("Root package.json is unavailable or too large.");
    const content = Buffer.alloc(stat.size);
    const { bytesRead } = await handle.read(content, 0, stat.size, 0);
    if (bytesRead !== stat.size) throw new Error("Could not read root package.json.");
    const manifest: unknown = JSON.parse(content.toString("utf8"));
    const script = manifest && typeof manifest === "object" && "scripts" in manifest &&
      manifest.scripts && typeof manifest.scripts === "object" && "test" in manifest.scripts
      ? manifest.scripts.test : undefined;
    if (typeof script !== "string" || !script.trim() || script.length > 4096) throw new Error("No usable root package.json test script.");
    return { repository, script };
  } finally { await handle?.close(); }
}

export class RepositoryTestBusy extends Error {}

export async function runRepositoryTests(homeDir: string, timeoutMs = TEST_TIMEOUT_MS) {
  const { repository, script } = await repositoryTestScript(homeDir);
  if (active.has(repository)) throw new RepositoryTestBusy("Repository tests are already running in this checkout.");
  active.add(repository);
  try {
    return await new Promise<{ repository: string; script: string; exitCode: number | null; timedOut: boolean; stdout: string; stderr: string; stdoutTruncated: boolean; stderrTruncated: boolean }>((resolve, reject) => {
      // Only the fixed root test script is eligible. No user command, flags,
      // cwd, or shell is accepted. Suppress npm pre/post lifecycle scripts.
      const child = spawn("npm", ["run", "test", "--ignore-scripts"], {
        cwd: repository, shell: false, detached: process.platform !== "win32",
        // Do not leak daemon credentials, agent tokens, or inherited runtime
        // overrides into untrusted repository code or its npm configuration.
        env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
          CI: "1", npm_config_ignore_scripts: "true", npm_config_userconfig: "/dev/null",
          npm_config_globalconfig: "/dev/null/orch8-no-global-config" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const output = { stdout: [] as Buffer[], stderr: [] as Buffer[] };
      const lengths = { stdout: 0, stderr: 0 };
      const truncated = { stdout: false, stderr: false };
      for (const stream of ["stdout", "stderr"] as const) {
        child[stream].on("data", (chunk: Buffer) => {
          const remaining = OUTPUT_LIMIT - lengths[stream];
          if (chunk.length > remaining) truncated[stream] = true;
          if (remaining > 0) {
            output[stream].push(chunk.subarray(0, remaining));
            lengths[stream] += Math.min(chunk.length, remaining);
          }
        });
      }
      let timedOut = false;
      const terminate = () => {
        try {
          if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch { /* Process already exited. */ }
      };
      const timer = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("close", code => {
        clearTimeout(timer);
        resolve({ repository, script, exitCode: timedOut ? null : code, timedOut,
          stdout: Buffer.concat(output.stdout).toString("utf8"), stderr: Buffer.concat(output.stderr).toString("utf8"),
          stdoutTruncated: truncated.stdout, stderrTruncated: truncated.stderr });
      });
    });
  } finally { active.delete(repository); }
}
