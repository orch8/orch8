import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, symlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRepositoryTests } from "../services/repository-tests.js";

describe("explicit repository test execution", () => {
  it("runs the declared npm test and returns the real exit status and separate output", async () => {
    const root = await mkdtemp(join(tmpdir(), "orch8-run-tests-"));
    try {
      await writeFile(join(root, "package.json"), JSON.stringify({ packageManager: "npm@10.0.0", scripts: { test: "node test.cjs" } }));
      await writeFile(join(root, "test.cjs"), "process.stdout.write('stdout marker'); process.stderr.write('stderr marker'); process.exitCode = 3;");
      const result = await runRepositoryTests(root);
      expect(result.command).toEqual(["npm", "run", "test", "--ignore-scripts"]);
      expect(result.exitCode).toBe(3);
      expect(result.stdout).toContain("stdout marker");
      expect(result.stderr).toContain("stderr marker");
      expect(result.timedOut).toBe(false);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("refuses unsupported managers and a symlinked manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "orch8-run-tests-"));
    const outside = await mkdtemp(join(tmpdir(), "orch8-run-tests-outside-"));
    try {
      await writeFile(join(root, "package.json"), JSON.stringify({ packageManager: "yarn@4.0.0", scripts: { test: "node test.cjs" } }));
      await expect(runRepositoryTests(root)).rejects.toThrow(/package manager/i);
      await rm(join(root, "package.json"));
      await writeFile(join(outside, "package.json"), JSON.stringify({ scripts: { test: "node test.cjs" } }));
      await symlink(join(outside, "package.json"), join(root, "package.json"));
      await expect(runRepositoryTests(root)).rejects.toThrow(/test script/i);
    } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
  });
  it("bounds output and terminates a timed-out process", async () => {
    const root = await mkdtemp(join(tmpdir(), "orch8-run-tests-"));
    try {
      await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "node test.cjs" } }));
      await writeFile(join(root, "test.cjs"), "process.stdout.write('x'.repeat(200000)); setInterval(() => {}, 1000);");
      const result = await runRepositoryTests(root, { timeoutMs: 1000, maxOutputBytes: 4096 });
      expect(result.timedOut).toBe(true);
      expect(result.outputTruncated).toBe(true);
      expect(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(4096);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("returns after timeout even when an escaped child keeps output pipes open", async () => {
    const root = await mkdtemp(join(tmpdir(), "orch8-run-tests-"));
    let escapedPid: number | undefined;
    try {
      await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "node test.cjs" } }));
      await writeFile(join(root, "test.cjs"), `const {spawn}=require('node:child_process'); const {writeFileSync}=require('node:fs'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:['ignore',1,2]}); writeFileSync('escaped.pid', String(child.pid)); child.unref(); setInterval(()=>{},1000);`);
      const started = Date.now();
      const result = await runRepositoryTests(root, { timeoutMs: 500 });
      expect(result.timedOut).toBe(true);
      expect(Date.now() - started).toBeLessThan(3000);
      escapedPid = Number(await readFile(join(root, "escaped.pid"), "utf8"));
    } finally {
      if (escapedPid) { try { process.kill(-escapedPid, "SIGKILL"); } catch { /* child exited */ } }
      await rm(root, { recursive: true, force: true });
    }
  });
});
