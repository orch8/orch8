import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_OUTPUT_BYTES = 64 * 1024;

type RunOptions = { timeoutMs?: number; maxOutputBytes?: number };

/** Executes only the root package.json test entry, never a command supplied by the request. */
export async function runRepositoryTests(root: string, options: RunOptions = {}) {
  let handle;
  let manifest: { scripts?: { test?: unknown }; packageManager?: unknown };
  try {
    handle = await open(join(root, "package.json"), constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 64 * 1024) throw new Error("No usable root test script.");
    manifest = JSON.parse(await handle.readFile({ encoding: "utf8" }));
    if (!manifest || typeof manifest !== "object" || typeof manifest.scripts?.test !== "string" ||
        !manifest.scripts.test.trim() || manifest.scripts.test.length > 4096) throw new Error("No usable root test script.");
  } catch { throw new Error("No usable root test script."); }
  finally { await handle?.close(); }

  const manager = manifest.packageManager === undefined ? "npm" :
    typeof manifest.packageManager === "string" ? manifest.packageManager.split("@")[0] : "";
  if (manager !== "npm" && manager !== "pnpm") throw new Error("Unsupported package manager. Only npm and pnpm test scripts can run here.");
  const command = manager === "pnpm" ? ["pnpm", "--config.enable-pre-post-scripts=false", "run", "test"] :
    ["npm", "run", "test", "--ignore-scripts"];
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_OUTPUT_BYTES;
  const scratch = await mkdtemp(join(tmpdir(), "orch8-test-home-"));
  try {
    return await new Promise<{ command: string[]; script: string; exitCode: number | null; signal: string | null; timedOut: boolean; outputTruncated: boolean; stdout: string; stderr: string }>((resolve, reject) => {
      // The package manager runs the declared script through its normal shell. No
      // request string enters the argv or shell; this is still untrusted code.
      const child = spawn(command[0], command.slice(1), {
        cwd: root, shell: false, detached: true, stdio: ["ignore", "pipe", "pipe"],
        env: { PATH: process.env.PATH ?? "", HOME: scratch, CI: "true", NO_COLOR: "1",
          npm_config_update_notifier: "false", npm_config_cache: join(scratch, "cache") },
      });
      let stdout = Buffer.alloc(0);
      let stderr = Buffer.alloc(0);
      let outputTruncated = false;
      let timedOut = false;
      const stop = () => {
        if (child.pid) {
          try { process.kill(-child.pid, "SIGKILL"); } catch { /* already exited */ }
        }
      };
      const collect = (stream: "stdout" | "stderr", chunk: Buffer) => {
        const remaining = Math.max(0, maxOutputBytes - stdout.length - stderr.length);
        if (chunk.length > remaining) outputTruncated = true;
        if (stream === "stdout") stdout = Buffer.concat([stdout, chunk.subarray(0, remaining)]);
        else stderr = Buffer.concat([stderr, chunk.subarray(0, remaining)]);
      };
      child.stdout.on("data", (chunk: Buffer) => collect("stdout", chunk));
      child.stderr.on("data", (chunk: Buffer) => collect("stderr", chunk));
      let settled = false;
      const finish = (code: number | null, signal: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // A package manager may exit before a child script. Kill remaining
        // descendants in its process group before returning to checkout work.
        stop();
        child.stdout.destroy();
        child.stderr.destroy();
        resolve({ command, script: manifest.scripts!.test as string, exitCode: code, signal,
          timedOut, outputTruncated, stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8") });
      };
      const timer = setTimeout(() => { timedOut = true; finish(null, "SIGKILL"); }, timeoutMs);
      child.on("error", error => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
      child.on("close", finish);
    });
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
