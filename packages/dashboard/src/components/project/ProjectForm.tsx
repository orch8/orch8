import { useState, useCallback } from "react";
import { useCreateProject, useUpdateProject } from "../../hooks/useProjects.js";
import type { Project } from "../../types.js";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

interface ProjectFormProps {
  project?: Project;
  onSuccess?: (project: Project) => void;
}

export function ProjectForm({ project, onSuccess }: ProjectFormProps) {
  const isEdit = !!project;

  const [name, setName] = useState(project?.name ?? "");
  const [slug, setSlug] = useState(project?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState(project?.description ?? "");
  const [homeDir, setHomeDir] = useState(project?.homeDir ?? "");
  const [worktreeDir, setWorktreeDir] = useState(project?.worktreeDir ?? "");
  const [defaultBranch, setDefaultBranch] = useState(
    project?.defaultBranch ?? "main",
  );
  const [budgetLimitUsd, setBudgetLimitUsd] = useState(
    project?.budgetLimitUsd ?? "",
  );

  const createProject = useCreateProject();
  const updateProject = useUpdateProject();

  const handleNameChange = useCallback(
    (value: string) => {
      setName(value);
      if (!slugTouched && !isEdit) {
        setSlug(slugify(value));
      }
    },
    [slugTouched, isEdit],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const budget =
      budgetLimitUsd !== "" ? Number(budgetLimitUsd) : undefined;

    if (isEdit) {
      const result = await updateProject.mutateAsync({
        projectId: project.id,
        name,
        description,
        defaultBranch,
        budgetLimitUsd: budget ?? null,
      });
      onSuccess?.(result);
    } else {
      const result = await createProject.mutateAsync({
        name,
        slug,
        description,
        homeDir,
        worktreeDir,
        defaultBranch,
        verificationRequired: true,
        budgetLimitUsd: budget,
      });
      onSuccess?.(result);
    }
  };

  const isPending = createProject.isPending || updateProject.isPending;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="project-name" className="text-sm font-medium text-zinc-300">
          Name
        </label>
        <input
          id="project-name"
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          required
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="project-slug" className="text-sm font-medium text-zinc-300">
          Slug
        </label>
        <input
          id="project-slug"
          type="text"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
          required
          disabled={isEdit}
          pattern="[a-z0-9-]+"
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 disabled:opacity-50"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="project-description" className="text-sm font-medium text-zinc-300">
          Description
        </label>
        <textarea
          id="project-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        />
      </div>

      {!isEdit && (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="project-home" className="text-sm font-medium text-zinc-300">
              Home Directory
            </label>
            <input
              id="project-home"
              type="text"
              value={homeDir}
              onChange={(e) => setHomeDir(e.target.value)}
              required
              placeholder="/path/to/git/repo"
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="project-worktree" className="text-sm font-medium text-zinc-300">
              Worktree Directory
            </label>
            <input
              id="project-worktree"
              type="text"
              value={worktreeDir}
              onChange={(e) => setWorktreeDir(e.target.value)}
              required
              placeholder="/path/to/worktrees"
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </div>
        </>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="project-branch" className="text-sm font-medium text-zinc-300">
          Default Branch
        </label>
        <input
          id="project-branch"
          type="text"
          value={defaultBranch}
          onChange={(e) => setDefaultBranch(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="project-budget" className="text-sm font-medium text-zinc-300">
          Budget Limit (USD)
        </label>
        <input
          id="project-budget"
          type="number"
          min="0"
          step="0.01"
          value={budgetLimitUsd}
          onChange={(e) => setBudgetLimitUsd(e.target.value)}
          placeholder="No limit"
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {isPending ? "Saving..." : isEdit ? "Update Project" : "Create Project"}
      </button>
    </form>
  );
}
