interface DiffFile {
  path: string;
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
    const pathMatch = header.match(/b\/(.+)/);
    const path = pathMatch?.[1] ?? "unknown";

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

    files.push({ path, hunks });
  }

  return files;
}

interface GitDiffViewerProps {
  diff: string;
  comments?: Array<{
    lineRef: string;
    body: string;
    author: string;
  }>;
  prUrl?: string;
}

export function GitDiffViewer({ diff, comments, prUrl }: GitDiffViewerProps) {
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
          key={file.path}
          className="overflow-hidden rounded-lg border border-zinc-800"
        >
          <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-2">
            <span className="font-mono text-sm text-zinc-300">{file.path}</span>
          </div>

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
