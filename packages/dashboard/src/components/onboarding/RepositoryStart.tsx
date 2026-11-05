import { useState, type FormEvent } from "react";
import { useCreateProject } from "../../hooks/useProjects.js";
import { api } from "../../api/client.js";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function defaultKey(name: string): string {
  return slugify(name).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
}

/** A short path into feature intake; the existing project wizard remains available. */
export function RepositoryStart({ onComplete }: { onComplete: (slug: string) => void }) {
  const create = useCreateProject();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [path, setPath] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [budget, setBudget] = useState("");
  const [noLimit, setNoLimit] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (create.isPending || checking) return;
    setError("");
    setChecking(true);
    try {
      const readiness = await api.post<{ ready: boolean; reason?: string }>("/projects/repository-readiness", {
        homeDir: path.trim(), defaultBranch: branch.trim(),
      });
      if (!readiness.ready) {
        setError(`Repository is not ready: ${readiness.reason ?? "Check the path, base branch and working tree."}`);
        return;
      }
      const project = await create.mutateAsync({
        name: name.trim(),
        slug: slugify(name.trim()),
        key: key.trim(),
        description: "",
        homeDir: path.trim(),
        ...(repoUrl.trim() ? { repoUrl: repoUrl.trim() } : {}),
        defaultBranch: branch.trim(),
        finishStrategy: "none",
        ...(noLimit ? {} : { budgetLimitUsd: Number(budget) }),
      });
      onComplete(project.slug);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open repository");
    } finally {
      setChecking(false);
    }
  }

  const inputClass = "w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100";
  return <section aria-label="Open a repository" className="rounded-lg border border-zinc-700 bg-zinc-900 p-5">
    <h1 className="text-xl font-semibold text-zinc-100">Open a repository</h1>
    <p className="mt-2 text-sm text-zinc-400">Choose a local git checkout, then describe the feature on its Build page. No agent starts when you open the repository. Plan approval and draft PR publication remain separate decisions.</p>
    <form onSubmit={event => { void submit(event); }} className="mt-5 space-y-4">
      <label className="block text-sm text-zinc-300">Repository name
        <input required value={name} onChange={event => { setName(event.target.value); if (!keyEdited) setKey(defaultKey(event.target.value)); }} placeholder="My app" className={`mt-1 ${inputClass}`} />
      </label>
      <label className="block text-sm text-zinc-300">Project key
        <input required value={key} maxLength={5} pattern="[A-Z][A-Z0-9]{1,4}" onChange={event => { setKeyEdited(true); setKey(event.target.value.toUpperCase()); }} className={`mt-1 ${inputClass}`} />
        <span className="mt-1 block text-xs text-zinc-400">Used for task IDs. If another project already uses this key, choose a different 2 to 5 character key.</span>
      </label>
      <label className="block text-sm text-zinc-300">Local repository path
        <input required value={path} onChange={event => setPath(event.target.value)} placeholder="/home/me/projects/my-app" className={`mt-1 ${inputClass}`} />
      </label>
      <label className="block text-sm text-zinc-300">GitHub repository URL (optional)
        <input type="text" value={repoUrl} onChange={event => setRepoUrl(event.target.value)} placeholder="https://github.com/owner/repo.git" className={`mt-1 ${inputClass}`} />
        <span className="mt-1 block text-xs text-zinc-400">Required only to publish a draft PR later. Use the origin URL for this checkout; Orch8 checks that they match before pushing. You can add it in project settings later.</span>
      </label>
      <label className="block text-sm text-zinc-300">Base branch
        <input required value={branch} onChange={event => setBranch(event.target.value)} className={`mt-1 ${inputClass}`} />
      </label>
      <label className="block text-sm text-zinc-300">Project spending limit (USD)
        <input required={!noLimit} disabled={noLimit} type="number" min="0.01" step="any" value={budget} onChange={event => setBudget(event.target.value)} placeholder="10.00" className={`mt-1 ${inputClass} disabled:opacity-40`} />
      </label>
      <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={noLimit} onChange={event => setNoLimit(event.target.checked)} /> No project spending limit (I understand agents can incur costs)</label>
      <p className="text-xs text-zinc-400">Choose a clean git checkout at its repository root, on the base branch. Orch8 checks the checkout before creating the project. The project starts with no automatic merge or PR strategy. Feature work requires a separate branch, and draft PR publication is an explicit action.</p>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <button type="submit" disabled={checking || create.isPending || !name.trim() || !/^[A-Z][A-Z0-9]{1,4}$/.test(key.trim()) || !path.trim() || !branch.trim() || (!noLimit && !(Number(budget) > 0))} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{checking ? "Checking repository..." : create.isPending ? "Opening..." : "Open and describe feature"}</button>
    </form>
  </section>;
}
