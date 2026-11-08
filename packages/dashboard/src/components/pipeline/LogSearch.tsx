import { useId, useState } from "react";

/** A navigation aid for the real run log, not a test-result parser. */
export function LogSearch({ content }: { content: string }) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches: Array<{ line: number; text: string }> = [];
  let total = 0;
  if (needle) {
    content.split(/\r?\n/).forEach((text, index) => {
      if (!text.toLowerCase().includes(needle)) return;
      total++;
      if (matches.length < 50) matches.push({ line: index + 1, text });
    });
  }
  return <div className="space-y-2" aria-label="Search run log">
    <label className="block text-zinc-300" htmlFor={inputId}>Find text in this run log</label>
    <input id={inputId} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Command, test name, error, or exit code" className="w-full rounded border border-zinc-700 bg-zinc-900 p-2 text-zinc-100" />
    {needle && <>
      <p role="status" className="text-zinc-400">{total === 0 ? "No matching lines." : `${total} matching ${total === 1 ? "line" : "lines"}${total > matches.length ? "; showing first 50" : ""}. Search is case-insensitive. Read surrounding output in the full log before deciding whether tests passed.`}</p>
      {matches.length > 0 && <ol className="max-h-64 space-y-1 overflow-auto rounded border border-zinc-700 bg-zinc-900 p-2 font-mono text-zinc-200">
        {matches.map(({ line, text }) => <li key={line} className="whitespace-pre-wrap break-all"><span className="mr-2 select-none text-zinc-500">{line}</span>{text}</li>)}
      </ol>}
    </>}
  </div>;
}
