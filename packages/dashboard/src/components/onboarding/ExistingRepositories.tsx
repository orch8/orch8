import { useProjects } from "../../hooks/useProjects.js";
import { usePipeline, usePipelines } from "../../hooks/usePipelines.js";

function RepositoryEntry({ project, onOpen, onResume }: {
  project: { id: string; slug: string; name: string; homeDir: string; defaultBranch: string };
  onOpen: (slug: string) => void;
  onResume: (slug: string, pipelineId: string) => void;
}) {
  const { data: pipelines, isError } = usePipelines(project.id, false);
  const unfinished = pipelines?.filter(p => ["pending", "running", "failed"].includes(p.status))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const { data: detail, isError: detailError } = usePipeline(unfinished?.id ?? null);
  const activeStep = detail?.steps.find(step => step.status === "awaiting_verification")
    ?? detail?.steps.find(step => step.status === "failed")
    ?? detail?.steps.find(step => step.status === "running")
    ?? detail?.steps.find(step => step.status === "pending");
  const action = detailError ? "Step status unavailable; open workflow to inspect it"
    : activeStep?.status === "awaiting_verification" ? `Your decision needed: ${activeStep.label}`
    : unfinished?.status === "failed" ? `${activeStep?.label ?? "Workflow"} failed; inspect the run`
      : activeStep ? `${activeStep.label}: ${activeStep.status}` : "Open unfinished workflow";

  return <li className="rounded border border-zinc-700 p-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-100">{project.name}</p>
        <p className="break-all text-xs text-zinc-400">{project.homeDir} · base {project.defaultBranch}</p>
      </div>
      <button type="button" onClick={() => onOpen(project.slug)} className="rounded border border-zinc-600 px-3 py-2 text-sm text-blue-300 hover:border-blue-500 focus-visible:outline-2 focus-visible:outline-blue-400">Open repository</button>
    </div>
    {unfinished && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-700 pt-3 text-sm">
      <p className="min-w-0 break-words text-amber-300">{unfinished.name} · {action}</p>
      <button type="button" onClick={() => onResume(project.slug, unfinished.id)} className="rounded bg-blue-700 px-3 py-2 text-white hover:bg-blue-600">Continue workflow</button>
    </div>}
    {isError && <p role="status" className="mt-2 text-xs text-amber-300">Workflow status unavailable. Open the repository to check its work.</p>}
  </li>;
}

/** Reopen an existing checkout, or jump straight to its unfinished work. */
export function ExistingRepositories({ onOpen, onResume }: { onOpen: (slug: string) => void; onResume: (slug: string, pipelineId: string) => void }) {
  const { data: projects, isLoading, isError, refetch } = useProjects(true);
  const repositories = (projects ?? []).filter(project => project.homeDir);

  return <section aria-label="Existing repositories" className="rounded-lg border border-zinc-700 bg-zinc-900 p-5">
    <h2 className="text-lg font-semibold text-zinc-100">Continue in a repository</h2>
    {isLoading && <p className="mt-2 text-sm text-zinc-400">Loading repositories...</p>}
    {isError && <p role="alert" className="mt-2 text-sm text-amber-300">Could not load repositories. <button type="button" onClick={() => void refetch()} className="underline">Retry</button></p>}
    {!isLoading && !isError && repositories.length === 0 && <p className="mt-2 text-sm text-zinc-400">No repositories opened yet. Add one below.</p>}
    {repositories.length > 0 && <ul className="mt-3 space-y-2">
      {repositories.map(project => <RepositoryEntry key={project.id} project={project} onOpen={onOpen} onResume={onResume} />)}
    </ul>}
  </section>;
}
