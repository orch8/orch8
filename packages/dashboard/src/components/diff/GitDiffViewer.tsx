import { useState } from "react";
import { api } from "../../api/client.js";

interface DiffFile {
  path: string;
  revision: number;
  hunks: DiffHunk[];
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
}

function parseDiff(raw: string): DiffFile[] {
  const files: DiffFile[] = [];
  const fileChunks = raw.split(/^diff --git /m).filter(Boolean);

  for (const chunk of fileChunks) {
    const lines = chunk.split("\n");

    const header = lines[0];
    // The +++ marker identifies the destination path without confusing " b/" inside a filename.
    const marker = lines.find(line => line.startsWith("+++ ") && line !== "+++ /dev/null")
      ?? lines.find(line => line.startsWith("--- ") && line !== "--- /dev/null");
    const markedPath = marker?.slice(4);
    const quoted = (markedPath ?? header).match(/"[ab]\/((?:\\.|[^"\\])*)"$/);
    const plain = markedPath?.match(/^[ab]\/(.*)$/);
    const headerPath = header.match(/ b\/(.+)$/);
    const path = quoted ? decodeGitPath(quoted[1]) : plain?.[1] ?? headerPath?.[1] ?? "unknown";

    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;

    for (const line of lines.slice(1)) {
      if (line.startsWith("@@")) {
        currentHunk = { header: line, lines: [] };
        hunks.push(currentHunk);
      } else if (currentHunk) {
        if (line.startsWith("+")) {
          currentHunk.lines.push({
            type: "add",
            content: line.substring(1),
          });
        } else if (line.startsWith("-")) {
          currentHunk.lines.push({
            type: "remove",
            content: line.substring(1),
          });
        } else if (line.startsWith(" ") || line === "") {
          currentHunk.lines.push({
            type: "context",
            content: line.substring(1),
          });
        }
      }
    }

    let revision = 2166136261;
    for (let i = 0; i < chunk.length; i++) revision = Math.imul(revision ^ chunk.charCodeAt(i), 16777619);
    files.push({ path, revision, hunks });
  }

  return files;
}

// Git quotes UTF-8 filename bytes as octal escapes when core.quotePath is on.
function decodeGitPath(path: string): string {
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  for (let i = 0; i < path.length; i++) {
    if (path[i] !== "\\") bytes.push(...encoder.encode(path[i]));
    else if (/^[0-7]{3}$/.test(path.slice(i + 1, i + 4))) {
      bytes.push(parseInt(path.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      const escaped = path[++i];
      if (escaped === undefined) break;
      bytes.push(...encoder.encode(({ t: "\t", n: "\n", r: "\r", b: "\b", f: "\f", v: "\v" } as Record<string, string>)[escaped] ?? escaped));
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

interface GitDiffViewerProps {
  diff: string;
  projectId?: string;
  comments?: Array<{
    lineRef: string;
    body: string;
    author: string;
  }>;
  prUrl?: string;
}

function CurrentFilePreview({ projectId, path }: { projectId: string; path: string }) {
  const [content, setContent] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  async function load() {
    setContent(undefined);
    setLoading(true);
    setError(false);
    try {
      const result = await api.get<{ path: string; content: string | null }>(
        `/projects/${encodeURIComponent(projectId)}/repository-files?path=${encodeURIComponent(path)}`,
      );
      if (result.path !== path) throw new Error("Unexpected file returned");
      setContent(result.content);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  return <details className="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-300" onToggle={event => {
    if (event.currentTarget.open && !loading) void load();
  }}>
    <summary className="cursor-pointer text-blue-300">Open current file</summary>
    <p className="mt-2 text-zinc-400">Current checkout when opened, not a saved copy of the reviewed revision. Close and reopen to refresh. Read-only and limited to tracked files.</p>
    {loading && <p className="mt-2">Loading file...</p>}
    {error && <p role="alert" className="mt-2 text-amber-300">File unavailable in the current checkout. It may be deleted or untracked. <button type="button" className="underline" onClick={() => void load()}>Retry</button></p>}
    {content === null && <p className="mt-2 text-amber-300">Preview unavailable for symlinks, binary files, or files over 32 KiB.</p>}
    {content !== undefined && content !== null && <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-zinc-950 p-3 text-zinc-200">{content || "(Empty file)"}</pre>}
  </details>;
}

export function GitDiffViewer({ diff, comments, prUrl, projectId }: GitDiffViewerProps) {
  if (!diff) {
    return <p className="text-sm text-zinc-600">No changes</p>;
  }

  const files = parseDiff(diff);

  return (
    <div className="flex flex-col gap-4">
      {prUrl && (
        <a
          href={prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-400 underline hover:text-blue-300"
        >
          View Pull Request
        </a>
      )}

      {files.map((file) => (
        <div
          key={`${file.path}:${file.revision}`}
          className="overflow-hidden rounded-lg border border-zinc-800"
        >
          <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-2">
            <span className="font-mono text-sm text-zinc-300">{file.path}</span>
          </div>

          {projectId && file.path !== "unknown" && <CurrentFilePreview key={`${projectId}:${file.path}`} projectId={projectId} path={file.path} />}

          {file.hunks.map((hunk, hi) => (
            <div key={hi}>
              <div className="bg-zinc-900/50 px-4 py-1 font-mono text-xs text-zinc-600">
                {hunk.header}
              </div>
              <div className="font-mono text-xs">
                {hunk.lines.map((line, li) => (
                  <div
                    key={li}
                    className={`px-4 py-0.5 ${
                      line.type === "add"
                        ? "bg-emerald-950/30 text-emerald-300"
                        : line.type === "remove"
                          ? "bg-red-950/30 text-red-300"
                          : "text-zinc-500"
                    }`}
                  >
                    <span className="mr-2 inline-block w-3 select-none text-right opacity-50">
                      {line.type === "add"
                        ? "+"
                        : line.type === "remove"
                          ? "-"
                          : " "}
                    </span>
                    {line.content}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}

      {comments && comments.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Verification Comments
          </h4>
          <div className="space-y-2">
            {comments.map((c, i) => (
              <div
                key={i}
                className="rounded border border-zinc-800 bg-zinc-900/50 p-3"
              >
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <span className="font-medium text-zinc-300">{c.author}</span>
                  {c.lineRef && (
                    <span className="font-mono text-zinc-600">{c.lineRef}</span>
                  )}
                </div>
                <p className="text-sm text-zinc-400">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
