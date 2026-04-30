import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAgents } from "../../../../hooks/useAgents.js";
import { useCreateProjectSkill } from "../../../../hooks/useProjectSkills.js";
import { Button } from "../../../../components/ui/Button.js";
import { Input } from "../../../../components/ui/Input.js";
import { PageHeader } from "../../../../components/ui/PageHeader.js";
import type { Agent } from "../../../../types.js";

const DEFAULT_MARKDOWN = [
  "# Instructions",
  "",
  "Describe when agents should use this skill and the procedure they should follow.",
].join("\n");

function NewSkillPage() {
  const { projectSlug: projectId } = Route.useParams();
  const navigate = useNavigate();
  const { data: agents = [] } = useAgents(projectId);
  const createSkill = useCreateProjectSkill(projectId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN);
  const [assignedAgentIds, setAssignedAgentIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setError(null);

    try {
      const skill = await createSkill.mutateAsync({
        name,
        description,
        markdown,
        assignedAgentIds,
      });
      navigate({
        to: "/projects/$projectSlug/skills/$skillId",
        params: { projectSlug: projectId, skillId: skill.id },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create skill");
    }
  }

  function toggleAgent(agentId: string) {
    setAssignedAgentIds((current) =>
      current.includes(agentId)
        ? current.filter((id) => id !== agentId)
        : [...current, agentId],
    );
  }

  return (
    <form className="mx-auto flex w-full max-w-7xl flex-col gap-[var(--gap-section)]" onSubmit={handleSubmit}>
      <div>
        <Button
          render={
            <Link
              to="/projects/$projectSlug/skills"
              params={{ projectSlug: projectId }}
            />
          }
          size="sm"
          variant="ghost"
        >
          <ArrowLeftIcon />
          Back to skills
        </Button>
      </div>

      <PageHeader
        title="New skill"
        subtitle="Create a project-local SKILL.md and choose which agents should receive it."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              render={
                <Link
                  to="/projects/$projectSlug/skills"
                  params={{ projectSlug: projectId }}
                />
              }
              size="sm"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || createSkill.isPending}
              size="sm"
              type="submit"
              variant="primary"
            >
              {createSkill.isPending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
              Create skill
            </Button>
          </div>
        }
      />

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 type-body text-destructive-foreground">
          {error}
        </p>
      ) : null}

      <div className="grid min-h-[calc(100vh-16rem)] gap-[var(--gap-section)] lg:grid-cols-[minmax(0,1fr)_22rem]">
        <main className="flex min-w-0 flex-col rounded-lg border border-edge-soft bg-surface">
          <div className="grid gap-4 border-b border-edge-soft p-5 md:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
            <Input
              autoFocus
              label="Name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Review helper"
              value={name}
            />
            <label className="flex flex-col gap-1.5">
              <span className="type-label text-mute">Description</span>
              <textarea
                className="min-h-24 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/72 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24"
                onChange={(event) => setDescription(event.target.value)}
                placeholder="When should agents use this skill?"
                value={description}
              />
            </label>
          </div>

          <label className="flex min-h-0 flex-1 flex-col">
            <span className="border-b border-edge-soft px-5 py-3 type-label text-mute">
              SKILL.md body
            </span>
            <textarea
              className="min-h-[34rem] flex-1 resize-y rounded-none border-0 bg-surface px-5 py-4 font-mono text-sm leading-relaxed text-ink outline-none placeholder:text-muted-foreground/72 focus-visible:ring-0"
              onChange={(event) => setMarkdown(event.target.value)}
              spellCheck={false}
              value={markdown}
            />
          </label>
        </main>

        <aside className="space-y-5">
          <section>
            <h2 className="mb-2 type-label text-mute">Assign to agents</h2>
            <AgentChecklist
              agents={agents}
              selectedAgentIds={assignedAgentIds}
              toggleAgent={toggleAgent}
            />
          </section>

          <section className="rounded-lg border border-edge-soft bg-surface p-4">
            <h2 className="type-label text-mute">File location</h2>
            <p className="mt-2 type-body text-mute">
              This creates a project skill under <span className="type-mono">.orch8/skills</span>.
            </p>
          </section>
        </aside>
      </div>
    </form>
  );
}

function AgentChecklist({
  agents,
  selectedAgentIds,
  toggleAgent,
}: {
  agents: Agent[];
  selectedAgentIds: string[];
  toggleAgent: (agentId: string) => void;
}) {
  if (agents.length === 0) {
    return (
      <div className="rounded-lg border border-edge-soft bg-surface p-4 type-body text-mute">
        No agents in this project yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {agents.map((agent) => (
        <label
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-edge-soft bg-surface p-3 hover:bg-surface-2"
          key={agent.id}
        >
          <input
            checked={selectedAgentIds.includes(agent.id)}
            className="size-4 accent-primary"
            onChange={() => toggleAgent(agent.id)}
            type="checkbox"
          />
          <span className="min-w-0">
            <span className="block truncate type-body font-medium text-ink">{agent.name}</span>
            <span className="block truncate type-micro">{agent.role}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectSlug/skills/new")({
  component: NewSkillPage,
});
