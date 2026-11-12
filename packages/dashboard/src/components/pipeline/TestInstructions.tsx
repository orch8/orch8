import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client.js";

type TestInstructionsResult = { repository: string; script: string | null; packageManager: string | null };
type RevisionSnapshot = { branch: string | null; commit: string | null; workingTree: "clean" | "dirty" | "unavailable" };
type LocalTestRun = { command: string[]; script: string; exitCode: number | null; signal: string | null;
  timedOut: boolean; outputTruncated: boolean; stdout: string; stderr: string;
  revisionBefore: RevisionSnapshot; revisionAfter: RevisionSnapshot; checkoutChanged: boolean;
  id?: string; pipelineId?: string; projectId?: string; repository?: string; triggeredBy?: string; createdAt?: string };

function revisionLine(label: string, snapshot: RevisionSnapshot) {
  return `${label}: branch ${snapshot.branch ?? "unavailable"}, commit ${snapshot.commit ?? "unavailable"}, working tree ${snapshot.workingTree}`;
}
function revisionWarning(run: LocalTestRun) {
  if (run.checkoutChanged) return "Checkout changed during the test; result cannot be attributed unchanged to one revision.";
  if (!run.revisionBefore.branch || !run.revisionBefore.commit || run.revisionBefore.workingTree === "unavailable" ||
      !run.revisionAfter.branch || !run.revisionAfter.commit || run.revisionAfter.workingTree === "unavailable")
    return "Revision information unavailable; this result cannot be attributed to a revision.";
  if (run.revisionBefore.workingTree === "dirty") return "Working tree was dirty; unchanged checkout cannot be established and the result is not solely attributable to the recorded commit.";
  return "Checkout snapshots match, but they cannot rule out changes made and reverted during the test.";
}

/** Explicit operator execution and separately supplied terminal results. */
export function TestInstructions({ projectId, pipelineId }: { projectId: string; pipelineId?: string }) {
  const [result, setResult] = useState<TestInstructionsResult | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [testOutput, setTestOutput] = useState("");
  const [exitCode, setExitCode] = useState("");
  const [outputError, setOutputError] = useState("");
  const [recorded, setRecorded] = useState<{ output: string; exitCode: string; repository: string; script: string } | null>(null);
  const [localRun, setLocalRun] = useState<LocalTestRun | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [historyError, setHistoryError] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(!!pipelineId);
  const maxOutputBytes = 128 * 1024;
  const selection = useRef(0);
  function downloadText(content: string, filename: string) {
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function downloadLocalRun() {
    if (!localRun || (!result && !localRun.repository)) return;
    downloadText([
      "Orch8 local repository test run (operator-triggered, not agent review or CI)",
      `Checkout path: ${localRun.repository ?? result?.repository}`,
      ...(localRun.pipelineId ? [`Workflow: ${localRun.pipelineId}`, `Run: ${localRun.id}`, `Recorded: ${localRun.createdAt}`] : []),
      revisionLine("Before", localRun.revisionBefore),
      revisionLine("After", localRun.revisionAfter),
      revisionWarning(localRun),
      `Command: ${localRun.command.join(" ")}`,
      `Root test script at execution: ${localRun.script}`,
      `Exit code: ${localRun.exitCode ?? "none"}`,
      `Signal: ${localRun.signal ?? "none"}`,
      `Timed out: ${localRun.timedOut}`,
      `Output truncated: ${localRun.outputTruncated}`,
      "", "stdout:", localRun.stdout, "", "stderr:", localRun.stderr,
    ].join("\n"), "orch8-local-test-run.txt");
  }
  function downloadResult() {
    if (!recorded) return;
    const content = [
      "Orch8 operator-supplied test result (not verified by Orch8)",
      "This is not agent-run evidence, independent review, or CI.",
      `Checkout: ${recorded.repository}`,
      `Root package.json test script: ${recorded.script}`,
      `Reported process exit code: ${recorded.exitCode}`,
      "",
      "Operator-supplied raw test output:",
      recorded.output,
    ].join("\n");
    downloadText(content, "orch8-operator-test-result.txt");
  }
  async function readOutput(file: File) {
    const selected = ++selection.current;
    setOutputError("");
    setRecorded(null);
    setTestOutput("");
    if (file.size > maxOutputBytes) {
      setOutputError("Output file exceeds 128 KB. Save a shorter excerpt and inspect the full log in your terminal.");
      return;
    }
    try {
      const content = await file.text();
      if (selected !== selection.current) return;
      if (new TextEncoder().encode(content).length > maxOutputBytes) throw new Error("Output exceeds 128 KB.");
      setTestOutput(content);
    } catch {
      if (selected === selection.current) setOutputError("Could not read the output file.");
    }
  }
  useEffect(() => {
    let active = true;

    api.get<TestInstructionsResult>(`/projects/${encodeURIComponent(projectId)}/test-instructions`)
      .then(value => { if (active) setResult(value); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [projectId]);
  useEffect(() => {
    if (!pipelineId) return;
    let active = true;
    setLocalRun(null);
    setHistoryError(false);
    setHistoryLoading(true);
    api.get<{ run: LocalTestRun | null }>(`/projects/${encodeURIComponent(projectId)}/test-runs/latest?pipelineId=${encodeURIComponent(pipelineId)}`)
      .then(value => { if (active) setLocalRun(value.run); })
      .catch(() => { if (active) setHistoryError(true); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [projectId, pipelineId]);
  const manager = result?.packageManager?.split("@")[0];
  const command = manager === "pnpm" ? "pnpm --config.enable-pre-post-scripts=false run test"
    : manager === "npm" || !result?.packageManager ? "npm run test --ignore-scripts" : null;
  async function runTests() {
    if (running) return;
    setRunning(true);
    setRunError("");
    try { setLocalRun(await api.post<LocalTestRun>(`/projects/${encodeURIComponent(projectId)}/run-tests`, pipelineId ? { pipelineId } : {})); }
    catch { setRunError("Could not run tests. The checkout may be busy, the package manager may be unavailable, or the test script may have changed. Retry after checking the repository."); }
    finally { setRunning(false); }
  }
  return <section aria-label="Run repository tests yourself" className="space-y-3 rounded border border-zinc-700 bg-zinc-950/60 p-4 text-xs text-zinc-300">
    <h2 className="text-sm font-semibold text-zinc-100">{pipelineId ? "Operator repository test evidence" : "Run repository tests yourself"}</h2>
    <p>Inspect the script before running it. Clicking Run executes repository code as the daemon user, with access to the daemon&apos;s files and network. Only run trusted checkouts. You can also run it in your own terminal. Neither result is agent review or CI.</p>
    {!result && !error && <p role="status">Inspecting root package.json...</p>}
    {error && <p role="alert" className="text-amber-300">Could not inspect the test script. Refresh the page to retry.</p>}
    {pipelineId && historyLoading && <p role="status">Loading saved workflow test run...</p>}
    {pipelineId && historyError && <p role="alert" className="text-amber-300">Could not load saved test evidence. Refresh to retry.</p>}
    {pipelineId && !historyLoading && !historyError && !localRun && <p>No operator test run recorded for this workflow yet.</p>}
    {result && <>
      <p>Checkout: <code className="break-all text-zinc-100">{result.repository}</code></p>
      {result.script ? <>
        <p>Root package.json test script: <code className="break-all text-zinc-100">{result.script}</code></p>
        {command ? <div className="flex flex-wrap items-center gap-3">
          <code className="break-all rounded bg-zinc-900 p-2 text-zinc-100">{command}</code>
          <button type="button" className="rounded border border-blue-600 px-3 py-2 text-blue-200" onClick={() => {
            void navigator.clipboard.writeText(command).then(() => setCopied(true)).catch(() => setCopied(false));
          }}>Copy command</button>
          {copied && <span role="status">Copied. Open your terminal in the checkout before pasting.</span>}
        </div> : <p role="alert" className="text-amber-300">This repository declares {result.packageManager} as its package manager. Orch8 cannot suggest a safe copyable command for it. Inspect its documentation and run the test script in your terminal.</p>}
        {command && <div className="space-y-2 rounded border border-zinc-700 p-3">
          <button type="button" disabled={running || historyLoading} className="rounded border border-blue-600 px-3 py-2 text-blue-200 disabled:opacity-50" onClick={() => void runTests()}>Run test script in checkout</button>
          <p>Runs the root test script with a 60-second timeout and 64 KB combined output limit. No package-manager lifecycle hooks. A test can spawn detached children that survive the timeout. If it times out, inspect and stop those processes before another feature run. {pipelineId ? "The result is saved for this workflow, but does not affect pipeline approval or review. Runs are blocked while a pipeline or agent is active in this checkout." : "The result stays in this tab and does not affect pipeline approval or review."}</p>
          {running && <p role="status">Running tests in the checkout...</p>}
          {runError && <p role="alert" className="text-amber-300">{runError}</p>}
          {localRun && <section aria-label="Local repository test run" className="space-y-2 rounded bg-zinc-900 p-3">
            <h3 className="font-semibold text-zinc-100">Local repository test run</h3>
            {localRun.pipelineId && <p>Saved for workflow <code>{localRun.pipelineId}</code> in project <code>{localRun.projectId}</code>. Triggered by {localRun.triggeredBy}; recorded {localRun.createdAt}. Run <code>{localRun.id}</code>.</p>}
            {localRun.repository && <p>Checkout at execution: <code className="break-all">{localRun.repository}</code></p>}
            <p>Command: <code>{localRun.command.join(" ")}</code></p>
            <p>Script: <code className="break-all">{localRun.script}</code></p>
            <p className="break-all">{revisionLine("Before", localRun.revisionBefore)}</p>
            <p className="break-all">{revisionLine("After", localRun.revisionAfter)}</p>
            <p role={localRun.checkoutChanged ? "alert" : undefined} className="text-amber-300">{revisionWarning(localRun)}</p>
            <p className={localRun.exitCode === 0 && !localRun.timedOut ? "text-emerald-300" : "text-amber-300"}>Exit code: {localRun.exitCode ?? "none"}{localRun.signal ? `, signal: ${localRun.signal}` : ""}{localRun.timedOut ? " (timed out)" : ""}</p>
            {localRun.timedOut && <p role="alert" className="text-amber-300">Timed out. Detached child processes may still be writing to this checkout. Inspect and stop them before starting another feature run.</p>}
            {localRun.outputTruncated && <p>Output truncated at 64 KB.</p>}
            <p>stdout</p><pre aria-label="Local test stdout" className="max-h-80 overflow-auto whitespace-pre-wrap break-words bg-zinc-950 p-2 font-mono">{localRun.stdout}</pre>
            <p>stderr</p><pre aria-label="Local test stderr" className="max-h-80 overflow-auto whitespace-pre-wrap break-words bg-zinc-950 p-2 font-mono">{localRun.stderr}</pre>
            <p>This is local operator execution, not agent-reviewed or CI evidence. Output may contain secrets; {localRun.id ? "Orch8 stores this bounded output for the workflow. Only run trusted scripts and inspect output before sharing it." : "it is not saved by Orch8. Download it before leaving this page if you need to keep it."}</p>
            <button type="button" onClick={downloadLocalRun} className="rounded border border-blue-600 px-3 py-2 text-blue-200">Download local test run</button>
          </section>}
        </div>}
        <p>{command ? "The command runs the test script even with package-manager lifecycle hooks disabled. " : ""}If you run it in your terminal, read the exit status and output there; the form below is only for your own reference.</p>
        <form className="space-y-3 rounded border border-zinc-700 p-3" onSubmit={event => {
          event.preventDefault();
          if (!testOutput.trim() || !/^(0|[1-9]\d*)$/.test(exitCode) || new TextEncoder().encode(testOutput).length > maxOutputBytes) return;
          setRecorded({ output: testOutput, exitCode, repository: result.repository, script: result.script! });
        }}>
          <h3 className="font-semibold text-zinc-100">Inspect your terminal test result</h3>
          <p>Run the tests yourself, then paste or load the output and enter the process exit code. This stays in this browser tab; Orch8 does not upload or verify it. Do not paste secrets.</p>
          <label className="block">Test output (maximum 128 KB)
            <textarea aria-label="Terminal test output" value={testOutput} onChange={event => { selection.current++; setOutputError(""); setRecorded(null); setTestOutput(event.target.value); }} rows={5} className="mt-1 w-full rounded bg-zinc-900 p-2 font-mono text-xs" />
          </label>
          <label className="block">Or load a local output file
            <input aria-label="Load terminal test output file" type="file" accept=".txt,.log,text/plain" onChange={event => { const file = event.target.files?.[0]; if (file) void readOutput(file); }} className="mt-1 block w-full" />
          </label>
          {outputError && <p role="alert" className="text-amber-300">{outputError}</p>}
          <label className="block">Process exit code
            <input aria-label="Test process exit code" inputMode="numeric" pattern="[0-9]+" value={exitCode} onChange={event => { setRecorded(null); setExitCode(event.target.value); }} className="mt-1 block w-28 rounded bg-zinc-900 p-2 font-mono" />
          </label>
          <button type="submit" disabled={!testOutput.trim() || !/^(0|[1-9]\d*)$/.test(exitCode) || new TextEncoder().encode(testOutput).length > maxOutputBytes} className="rounded border border-blue-600 px-3 py-2 text-blue-200 disabled:opacity-50">Inspect result</button>
        </form>
        {recorded && <section aria-label="Operator-supplied test result" className="space-y-2 rounded border border-zinc-700 bg-zinc-900 p-3">
          <h3 className="font-semibold text-zinc-100">Operator-supplied test result, not verified by Orch8</h3>
          <p>Checkout: <code className="break-all">{recorded.repository}</code> · test script: <code className="break-all">{recorded.script}</code></p>
          <p className={recorded.exitCode === "0" ? "text-emerald-300" : "text-amber-300"}>Reported process exit code: {recorded.exitCode}{recorded.exitCode === "0" ? " (reported success)" : " (reported failure)"}</p>
          <pre aria-label="Operator-supplied raw test output" className="max-h-80 overflow-auto whitespace-pre-wrap break-words bg-zinc-950 p-2 font-mono">{recorded.output}</pre>
          <p>This is not agent-run evidence, independent review, or CI. It disappears when the tab reloads unless you download it. Inspect the current repository checkout and command yourself.</p>
          <button type="button" onClick={downloadResult} className="rounded border border-blue-600 px-3 py-2 text-blue-200">Download test result</button>
        </section>}
      </> : <p role="status" className="text-amber-300">No usable root package.json test script found. Check the test instructions for this repository.</p>}
    </>}
  </section>;
}
