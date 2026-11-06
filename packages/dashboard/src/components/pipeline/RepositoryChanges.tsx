import { GitDiffViewer } from "../diff/GitDiffViewer.js";
import { useRepositoryChanges } from "../../hooks/usePipelines.js";

/** A repository-wide live snapshot, independent of workflow history. */
export function RepositoryChanges({ projectId, projectError = false }: { projectId?: string; projectError?: boolean }) {
  const { data, isLoading, isError, isFetching, refetch } = useRepositoryChanges(projectId);
  return (
    <section aria-label="Repository changes" className="space-y-4 rounded border border-zinc-800 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-200">Repository changes</h2>
        <button type="button" disabled={!projectId || isFetching} onClick={() => { void refetch(); }} className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:text-white disabled:opacity-50">
          {isFetching ? "Refreshing..." : "Refresh repository changes"}
        </button>
      </div>
      <p className="text-xs text-zinc-400">Live repository-wide snapshot, not a workflow artifact or proof of who made a change. Committed changes compare this checkout with the merge base of the configured branch, preferring the locally fetched origin ref. No fetch is performed. Staged and unstaged edits are separate from commits; untracked contents and submodule changes are not shown. This view does not run tests.</p>
      {!projectError && (!projectId || isLoading) && <p className="text-xs text-zinc-500">Loading repository changes...</p>}
      {projectError && <p role="alert" className="text-xs text-amber-300">Could not load this project. Check the repository selection or refresh the page.</p>}
      {isError && <p role="alert" className="text-xs text-amber-300">Could not load repository changes. Try refreshing.</p>}
      {!isError && data && !data.available && <p role="status" className="text-xs text-amber-300">{data.reason ?? "Repository changes unavailable."}</p>}
      {!isError && data?.available && <div className="space-y-4">
        <div className="space-y-1 rounded border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-300">
          <p>Checked-out branch: <span className="font-mono">{data.branch ?? "detached HEAD"}</span></p>
          <p>Configured base: <span className="font-mono">{data.baseBranch}</span></p>
          {data.pullRequest ? <>
            <p>GitHub PR for this exact branch commit: <a className="text-blue-300 underline" href={data.pullRequest.url} target="_blank" rel="noopener noreferrer">#{data.pullRequest.number} {data.pullRequest.title}</a> ({data.pullRequest.state.toLowerCase()})</p>
            <div aria-label="GitHub checks for current commit">
              <p>GitHub checks reported for this commit:</p>
              {data.pullRequest.checks?.length ? <ul className="ml-4 list-disc">{data.pullRequest.checks.map((check, index) => <li key={`${check.name}-${index}`}>
                {check.url ? <a className="text-blue-300 underline" href={check.url} target="_blank" rel="noopener noreferrer">{check.name}: {check.status}</a> : <span>{check.name}: {check.status}</span>}
              </li>)}</ul> : <p className="text-amber-300">No checks reported for this commit. This does not mean tests passed.</p>}
            </div>
          </> : data.prLookup === "none" ? <p>No GitHub PR found for this branch commit and configured base. Uncommitted changes are not part of a PR.</p>
            : data.prLookup === "unavailable" ? <p>PR lookup unavailable. Check GitHub authentication and the repository origin; no check result is known.</p>
              : <p>PR lookup applies to named branches other than the configured base.</p>}
        </div>
        {!data.committedDiff && !data.workingDiff && !data.untrackedFiles?.length && !data.untrackedMore && <p role="status" className="text-xs text-zinc-400">No repository changes found in this snapshot.</p>}
        <div><h3 className="mb-2 text-xs font-medium text-zinc-300">Committed changes since {data.baseBranch}</h3><GitDiffViewer diff={data.committedDiff ?? ""} /></div>
        <div><h3 className="mb-2 text-xs font-medium text-zinc-300">Staged and unstaged changes</h3><GitDiffViewer diff={data.workingDiff ?? ""} /></div>
        <div>
          <h3 className="mb-2 text-xs font-medium text-zinc-300">Untracked files (names only)</h3>
          {data.untrackedFiles?.length ? <ul className="space-y-1 font-mono text-xs text-zinc-400">{data.untrackedFiles.map(path => <li key={path} className="break-all">{path}</li>)}</ul> : <p className="text-xs text-zinc-500">None found</p>}
          {data.untrackedMore && <p className="mt-2 text-xs text-amber-300">More untracked files exist; only the first 20 names are shown.</p>}
        </div>
      </div>}
    </section>
  );
}
