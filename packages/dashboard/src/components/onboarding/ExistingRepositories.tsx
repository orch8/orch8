import { useProjects } from "../../hooks/useProjects.js";

/** Reopen an already configured repository without creating another project. */
export function ExistingRepositories({ onOpen }: { onOpen: (slug: string) => void }) {
  const { data: projects, isLoading, isError, refetch } = useProjects(true);
  const repositories = (projects ?? []).filter(project => project.homeDir);

  return <section aria-label="Existing repositories" className="rounded-lg border border-zinc-700 bg-zinc-900 p-5">
    <h2 className="text-lg font-semibold text-zinc-100">Continue in a repository</h2>
    {isLoading && <p className="mt-2 text-sm text-zinc-400">Loading repositories...</p>}
    {isError && <p role="alert" className="mt-2 text-sm text-amber-300">Could not load repositories. <button type="button" onClick={() => void refetch()} className="underline">Retry</button></p>}
    {!isLoading && !isError && repositories.length === 0 && <p className="mt-2 text-sm text-zinc-400">No repositories opened yet. Add one below.</p>}
    {repositories.length > 0 && <ul className="mt-3 space-y-2">
      {repositories.map(project => <li key={project.id}>
        <button type="button" onClick={() => onOpen(project.slug)} className="w-full rounded border border-zinc-700 px-3 py-2 text-left hover:border-blue-500 focus-visible:outline-2 focus-visible:outline-blue-400">
          <span className="block text-sm font-medium text-blue-300">{project.name}</span>
          <span className="block break-all text-xs text-zinc-400">{project.homeDir} · base {project.defaultBranch}</span>
        </button>
      </li>)}
    </ul>}
  </section>;
}
