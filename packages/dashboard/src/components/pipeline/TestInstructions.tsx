import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client.js";

type TestInstructionsResult = { repository: string; script: string | null };

/** Operator-run test instructions. Repository code never runs in the daemon. */
export function TestInstructions({ projectId }: { projectId: string }) {
  const [result, setResult] = useState<TestInstructionsResult | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [testOutput, setTestOutput] = useState("");
  const [exitCode, setExitCode] = useState("");
  const [outputError, setOutputError] = useState("");
  const [recorded, setRecorded] = useState<{ output: string; exitCode: string; repository: string; script: string } | null>(null);
  const maxOutputBytes = 128 * 1024;
  const selection = useRef(0);
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
  const command = "npm run test --ignore-scripts";
  return <section aria-label="Run repository tests yourself" className="space-y-3 rounded border border-zinc-700 bg-zinc-950/60 p-4 text-xs text-zinc-300">
    <h2 className="text-sm font-semibold text-zinc-100">Run repository tests yourself</h2>
    <p>Orch8 will not execute a checkout&apos;s test script as the daemon user. Inspect the script below, then run it in your own terminal from this checkout only if you trust its code. This action is separate from agent implementation, independent review, and CI checks.</p>
    {!result && !error && <p role="status">Inspecting root package.json...</p>}
    {error && <p role="alert" className="text-amber-300">Could not inspect the test script. Refresh the page to retry.</p>}
    {result && <>
      <p>Checkout: <code className="break-all text-zinc-100">{result.repository}</code></p>
      {result.script ? <>
        <p>Root package.json test script: <code className="break-all text-zinc-100">{result.script}</code></p>
        <div className="flex flex-wrap items-center gap-3">
          <code className="break-all rounded bg-zinc-900 p-2 text-zinc-100">{command}</code>
          <button type="button" className="rounded border border-blue-600 px-3 py-2 text-blue-200" onClick={() => {
            void navigator.clipboard.writeText(command).then(() => setCopied(true)).catch(() => setCopied(false));
          }}>Copy command</button>
          {copied && <span role="status">Copied. Open your terminal in the checkout before pasting.</span>}
        </div>
        <p>The command runs the test script, even with npm lifecycle hooks disabled. No output is uploaded or counted as a passing test by Orch8. Read the exit status and output in your terminal.</p>
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
          <p>This is not agent-run evidence, independent review, or CI. It disappears when the tab reloads. Inspect the current repository checkout and command yourself.</p>
        </section>}
      </> : <p role="status" className="text-amber-300">No usable root package.json test script found. Check the test instructions for this repository.</p>}
    </>}
  </section>;
}
