import { useEffect, useState } from "react";
import { api } from "../../api/client.js";

type TestInstructionsResult = { repository: string; script: string | null };

/** Operator-run test instructions. Repository code never runs in the daemon. */
export function TestInstructions({ projectId }: { projectId: string }) {
  const [result, setResult] = useState<TestInstructionsResult | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
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
      </> : <p role="status" className="text-amber-300">No usable root package.json test script found. Check this repository's own test instructions.</p>}
    </>}
  </section>;
}
