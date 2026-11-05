import { useRef, useState } from "react";
import { collectPipelineEvidence, downloadPipelineEvidence } from "../../lib/pipelineEvidence.js";

export function DownloadEvidence({ pipelineId }: { pipelineId: string }) {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function download() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setMessage("");
    setFailed(false);
    try {
      const packet = await collectPipelineEvidence(pipelineId);
      downloadPipelineEvidence(pipelineId, packet);
      setMessage("Download requested. Inspect the packet for missing or unverified evidence.");
    } catch {
      setFailed(true);
      setMessage("Could not download evidence. Refresh pipeline state and try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return <section aria-label="Download pipeline evidence" className="space-y-2 text-xs">
    <button type="button" disabled={pending} onClick={() => void download()} className="rounded border border-zinc-700 px-3 py-2 text-blue-300 disabled:opacity-50">
      {pending ? "Preparing evidence..." : "Download evidence"}
    </button>
    <p className="text-zinc-400">Downloads a local Markdown snapshot. Logs can contain secrets. Text sections are limited to 40,000 characters with explicit truncation. No packet is stored server-side.</p>
    {pending && <p role="status">Collecting current evidence...</p>}
    {message && <p role={failed ? "alert" : "status"}>{message}</p>}
  </section>;
}
