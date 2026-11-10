import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client.js";

type ScriptInfo = { available: boolean; repository: string; script?: string; reason?: string };
type TestResult = { repository: string; script: string; exitCode: number | null; timedOut: boolean; stdout: string; stderr: string; stdoutTruncated: boolean; stderrTruncated: boolean };

/** Explicit operator-run verification, separate from agent and review evidence. */
export function RepositoryTests({ projectId }: { projectId?: string }) {
  const [info, setInfo] = useState<ScriptInfo | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    const current = ++generation.current;
    setInfo(null); setResult(null); setError(""); setRunning(false);
    if (projectId) api.get<ScriptInfo>(`/projects/${encodeURIComponent(projectId)}/repository-tests`)
      .then(value => { if (generation.current === current) setInfo(value); })
      .catch(() => { if (generation.current === current) setError("Could not inspect the repository test script."); });
    return () => { generation.current++; };
  }, [projectId]);
  async function run() {
    if (!projectId || !info?.available || !info.script || pending.current) return;
    const current = generation.current;
    pending.current = true;
    setRunning(true); setResult(null); setError("");
    try {
      const value = await api.post<TestResult>(`/projects/${encodeURIComponent(projectId)}/repository-tests`, {});
      if (generation.current === current) setResult(value);
    } catch (failure) {
      if (generation.current === current) setError(failure instanceof Error ? failure.message : "Repository tests could not run.");
    } finally {
      pending.current = false;
      if (generation.current === current) setRunning(false);
    }
  }
  return <section aria-label="Repository tests" className="space-y-2 rounded border border-zinc-700 bg-zinc-950/60 p-3 text-xs text-zinc-300">
    <h3 className="font-semibold text-zinc-100">Run repository tests</h3>
    <p>Independent manual verification only. This runs the root package.json test script in the selected local checkout, without an agent. It does not implement a feature, approve a plan or review, change agent permissions, or count toward agent budget. The script itself can execute repository code; inspect it before running.</p>
    {!info && !error && <p>Checking root package.json...</p>}
    {info && <><p>Repository: <span className="break-all font-mono">{info.repository}</span></p>
      {info.available ? <p>Test script (npm run test): <code className="break-all text-zinc-100">{info.script}</code></p>
        : <p role="status" className="text-amber-300">{info.reason ?? "No usable root package.json test script."}</p>}</>}
    <button type="button" disabled={!projectId || !info?.available || running} onClick={() => void run()} className="rounded border border-blue-600 px-3 py-2 text-blue-200 disabled:opacity-40">{running ? "Running repository tests..." : "Run repository tests"}</button>
    <p className="text-zinc-500">Runs only when clicked. Limit: 2 minutes and 16 KiB per output stream. Results stay in this page only; inspect output for secrets before sharing.</p>
    {error && <p role="alert" className="break-words text-amber-300">{error}</p>}
    {result && <div aria-label="Repository test result" className="space-y-2">
      <p>Repository: <span className="break-all font-mono">{result.repository}</span> · Script: <code className="break-all">{result.script}</code></p>
      <p role="status" className={result.exitCode === 0 && !result.timedOut ? "text-emerald-300" : "text-amber-300"}>{result.timedOut ? "Timed out after 2 minutes; exit code unavailable" : `Exit code: ${result.exitCode === null ? "unavailable" : result.exitCode}`}. Independent manual verification, not implementation or independent review evidence.</p>
      <div><h4>stdout{result.stdoutTruncated ? " (truncated at 16 KiB)" : ""}</h4><pre aria-label="Repository test stdout" className="max-h-64 overflow-auto whitespace-pre-wrap break-words bg-zinc-900 p-2">{result.stdout || "(empty)"}</pre></div>
      <div><h4>stderr{result.stderrTruncated ? " (truncated at 16 KiB)" : ""}</h4><pre aria-label="Repository test stderr" className="max-h-64 overflow-auto whitespace-pre-wrap break-words bg-zinc-900 p-2">{result.stderr || "(empty)"}</pre></div>
    </div>}
  </section>;
}
