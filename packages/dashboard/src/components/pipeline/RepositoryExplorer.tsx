import { useEffect, useState } from "react";
import { api } from "../../api/client.js";

type FileList = { paths: string[]; truncated: boolean };
type FilePreview = { path: string; content: string | null };

/** Browse only tracked files from the selected project; never edits repository state. */
export function RepositoryExplorer({ projectId, onAddFile, addedPaths = [] }: { projectId: string; onAddFile?: (path: string) => void; addedPaths?: string[] }) {
  const [list, setList] = useState<FileList | null>(null);
  const [listError, setListError] = useState(false);
  const [filter, setFilter] = useState("");
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState("");
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [previewRetry, setPreviewRetry] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      api.get<FileList>(`/projects/${encodeURIComponent(projectId)}/repository-files?q=${encodeURIComponent(filter)}`)
        .then(value => { if (active) setList({ paths: Array.isArray(value?.paths) ? value.paths : [], truncated: value?.truncated === true }); })
        .catch(() => { if (active) setListError(true); });
    }, filter ? 200 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [projectId, filter, retry]);

  useEffect(() => {
    let active = true;
    if (selected) api.get<FilePreview>(`/projects/${encodeURIComponent(projectId)}/repository-files?path=${encodeURIComponent(selected)}`)
      .then(value => { if (active) setPreview(value); })
      .catch(() => { if (active) setPreviewError(true); });
    return () => { active = false; };
  }, [projectId, selected, previewRetry]);

  const matches = list?.paths.filter(path => path.toLowerCase().includes(filter.toLowerCase())).slice(0, 80) ?? [];
  return <details className="mt-3 rounded border border-zinc-700 bg-zinc-950 p-3 text-sm" aria-label="Explore repository files">
    <summary className="cursor-pointer font-medium text-blue-300">Explore repository files</summary>
    <p className="mt-2 text-xs text-zinc-400">Browse tracked files while describing your feature. Read-only; generated, ignored and untracked files are not listed.</p>
    {listError ? <p role="alert" className="mt-2 text-amber-300">Could not list files in this checkout. <button type="button" onClick={() => { setListError(false); setRetry(value => value + 1); }} className="text-blue-300 underline">Retry</button></p> : !list ? <p className="mt-2 text-zinc-400">Loading files...</p> : <>
      <label className="mt-3 block text-xs text-zinc-300" htmlFor="repository-file-filter">Find a file</label>
      <input id="repository-file-filter" type="search" maxLength={120} value={filter} onChange={event => { setListError(false); setFilter(event.target.value); }} placeholder="Search tracked paths" className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 p-2 text-zinc-100" />
      {list.truncated && <p role="status" className="mt-1 text-xs text-amber-300">Showing the first 500 matches. Narrow your search to find more.</p>}
      {list.paths.length > 80 && <p className="mt-1 text-xs text-zinc-400">Showing 80 paths here. Search to narrow the list.</p>}
      <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-2">
        <div aria-label="Tracked files" className="max-h-64 overflow-auto rounded border border-zinc-800">
          {matches.length ? matches.map(path => <button key={path} type="button" onClick={() => { setPreview(null); setPreviewError(false); setSelected(path); setPreviewRetry(value => value + 1); }} aria-pressed={selected === path} className={`block w-full break-all border-b border-zinc-800 p-2 text-left font-mono text-xs ${selected === path ? "bg-blue-950 text-blue-200" : "text-zinc-300 hover:bg-zinc-800"}`}>{path}</button>) : <p className="p-3 text-xs text-zinc-400">No matching tracked files.</p>}
        </div>
        <div aria-label="File preview" className="min-w-0 max-h-64 overflow-auto rounded border border-zinc-800 p-3">
          {!selected ? <p className="text-xs text-zinc-400">Select a file to read it.</p> : <>
            <h4 className="break-all font-mono text-xs text-zinc-200">{selected}</h4>
            {previewError ? <p role="alert" className="mt-2 text-amber-300">Could not read this file.</p> : !preview ? <p className="mt-2 text-zinc-400">Loading preview...</p> : <>
              {onAddFile && preview.path === selected && <button type="button" disabled={addedPaths.includes(selected) || addedPaths.length >= 5} onClick={() => onAddFile(selected)} className="mt-2 rounded border border-blue-500 px-2 py-1 text-xs text-blue-200 disabled:opacity-40">{addedPaths.includes(selected) ? "Added to feature" : "Add path to feature"}</button>}
              {preview.content === null ? <p className="mt-2 text-xs text-zinc-400">Preview unavailable for symlinks, binary files, or files over 32 KiB.</p> : <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-zinc-300">{preview.content}</pre>}
            </>}
          </>}
        </div>
      </div>
    </>}
  </details>;
}
