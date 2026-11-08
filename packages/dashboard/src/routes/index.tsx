import { createFileRoute, Link } from "@tanstack/react-router";
import { useProjects } from "../hooks/useProjects.js";

function RepositoryChooser() {
  const { data: projects, isLoading, isError, refetch } = useProjects();
  const active = projects?.filter(project => project.active) ?? [];

  return <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Open a repository</h1>
        <p className="mt-2 text-sm text-zinc-400">Choose a checkout to build a feature, add a local Git repository, or clone one from GitHub.</p>
      </div>
      <Link to="/projects/new" className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">Add repository</Link>
    </div>
    {isLoading && <p role="status" className="text-zinc-400">Loading repositories...</p>}
    {isError && <div role="alert" className="rounded border border-amber-700 p-4 text-amber-200">Could not load repositories. <button type="button" onClick={() => void refetch()} className="underline">Retry</button></div>}
    {!isLoading && !isError && active.length === 0 && <p className="rounded border border-zinc-700 p-5 text-zinc-300">No active repositories yet. Add a local checkout to start a feature.</p>}
    {active.length > 0 && <ul className="space-y-3" aria-label="Available repositories">
      {active.map(project => <li key={project.id}>
        <Link to="/projects/$projectSlug/pipelines" params={{ projectSlug: project.slug }} className="block rounded border border-zinc-700 bg-zinc-900 p-4 hover:border-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
          <span className="block font-medium text-zinc-100">{project.name}</span>
          <span className="mt-1 block break-all font-mono text-xs text-zinc-400">{project.homeDir}</span>
          <span className="mt-2 block text-xs text-blue-300">Open feature workflows →</span>
        </Link>
      </li>)}
    </ul>}
  </div>;
}

export const Route = createFileRoute("/")({ component: RepositoryChooser });
