import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  BookOpenIcon,
  FileTextIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";
import { useAgents } from "../../../../hooks/useAgents.js";
import {
  useCreateProjectSkill,
  useProjectSkills,
  useSyncProjectSkills,
} from "../../../../hooks/useProjectSkills.js";
import { Button } from "../../../../components/ui/Button.js";
import { Badge } from "../../../../components/ui/Badge.js";
import { EmptyState } from "../../../../components/ui/EmptyState.js";
import { Input } from "../../../../components/ui/Input.js";
import { Textarea } from "../../../../components/ui/Textarea.js";
import { PageHeader } from "../../../../components/ui/PageHeader.js";
import { Skeleton } from "../../../../components/ui/Skeleton.js";
import { Table, TBody, TD, TH, THead, TR } from "../../../../components/ui/Table.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "../../../../components/ui/Dialog.js";
import type { Agent, ProjectSkill } from "../../../../types.js";

type FilterKey = "all" | "used" | "unused" | "project" | "global";
type FileInventoryItem = { path: string; kind: string };

const FILTERS: Array<{ value: FilterKey; label: string }> = [
  { value: "all", label: "All" },
  { value: "used", label: "In use" },
  { value: "unused", label: "Unused" },
  { value: "project", label: "Project" },
  { value: "global", label: "Global" },
];

const TRUST_COPY: Record<string, { label: string; variant: "success" | "warning" | "error"; icon: typeof ShieldCheckIcon }> = {
  markdown_only: { label: "Markdown", variant: "success", icon: ShieldCheckIcon },
  assets: { label: "Assets", variant: "warning", icon: ShieldCheckIcon },
  scripts_executables: { label: "Scripts", variant: "error", icon: ShieldAlertIcon },
};

function SkillsPage() {
  const { projectSlug: projectId } = Route.useParams();
  const navigate = useNavigate();
  const { data: skills = [], isLoading, isError, error, refetch } = useProjectSkills(projectId);
  const { data: agents = [] } = useAgents(projectId);
  const syncSkills = useSyncProjectSkills(projectId);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const assignments = useMemo(() => buildAssignments(agents), [agents]);

  const filteredSkills = useMemo(() => {
    const q = search.trim().toLowerCase();
    return skills.filter((skill) => {
      const used = (assignments.get(skill.slug)?.length ?? 0) > 0;
      if (filter === "used" && !used) return false;
      if (filter === "unused" && used) return false;
      if (filter === "project" && skill.sourceType !== "local_path") return false;
      if (filter === "global" && skill.sourceType !== "global") return false;
      if (!q) return true;
      return [skill.name, skill.slug, skill.description ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [assignments, filter, search, skills]);

  const totalFiles = useMemo(
    () => skills.reduce((sum, skill) => sum + getFileInventory(skill).length, 0),
    [skills],
  );

  if (isLoading) {
    return <SkillsSkeleton />;
  }

  if (isError) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-center">
        <AlertTriangleIcon className="size-8 text-destructive-foreground" />
        <div>
          <p className="type-section text-ink">Could not load skills</p>
          <p className="mt-1 type-body text-mute">
            {error instanceof Error ? error.message : "The daemon did not return the project skill list."}
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--gap-section)]">
      <PageHeader
        title="Skills"
        subtitle="Project and global instructions your agents can opt into."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => syncSkills.mutate()}
              disabled={syncSkills.isPending}
              variant="outline"
              size="sm"
            >
              <RefreshCwIcon className={syncSkills.isPending ? "animate-spin" : ""} />
              {syncSkills.isPending ? "Syncing" : "Sync from disk"}
            </Button>
            <Button onClick={() => setCreateOpen(true)} size="sm" variant="primary">
              <PlusIcon />
              New skill
            </Button>
          </div>
        }
      />

      <div className="grid gap-[var(--gap-block)] md:grid-cols-3">
        <Metric label="Skills" value={skills.length} icon={BookOpenIcon} />
        <Metric label="In use" value={countUsed(skills, assignments)} icon={UsersIcon} />
        <Metric label="Files" value={totalFiles} icon={FileTextIcon} />
      </div>

      <div className="rounded-lg border border-edge-soft bg-surface">
        <div className="flex flex-col gap-3 border-b border-edge-soft p-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-mute" />
            <Input
              aria-label="Search skills"
              className="pl-8"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search skills..."
              type="search"
              value={search}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <Button
                key={item.value}
                onClick={() => setFilter(item.value)}
                size="xs"
                variant={filter === item.value ? "primary" : "outline"}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        {skills.length === 0 ? (
          <div className="p-[var(--gap-section)]">
            <EmptyState
              title="No skills found"
              body="Sync from disk to discover global skills and project-local skills in .orch8/skills."
              cta={
                <Button onClick={() => syncSkills.mutate()} disabled={syncSkills.isPending} size="sm">
                  <RefreshCwIcon className={syncSkills.isPending ? "animate-spin" : ""} />
                  Sync from disk
                </Button>
              }
            />
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="px-6 py-12 text-center type-body text-mute">
            No skills match this search and filter.
          </div>
        ) : (
          <Table className="border-0">
            <THead>
              <tr>
                <TH>Skill</TH>
                <TH className="hidden md:table-cell">Used by</TH>
                <TH className="hidden lg:table-cell">Source</TH>
                <TH>Trust</TH>
                <TH className="hidden md:table-cell">Files</TH>
              </tr>
            </THead>
            <TBody>
              {filteredSkills.map((skill) => (
                <SkillRow
                  key={skill.id}
                  agents={assignments.get(skill.slug) ?? []}
                  onOpen={() =>
                    navigate({
                      to: "/projects/$projectSlug/skills/$skillId",
                      params: { projectSlug: projectId, skillId: skill.id },
                    })
                  }
                  skill={skill}
                />
              ))}
            </TBody>
          </Table>
        )}
      </div>

      <CreateSkillDialog
        agents={agents}
        onClose={() => setCreateOpen(false)}
        onCreated={(skill) => {
          setCreateOpen(false);
          navigate({
            to: "/projects/$projectSlug/skills/$skillId",
            params: { projectSlug: projectId, skillId: skill.id },
          });
        }}
        open={createOpen}
        projectId={projectId}
      />
    </div>
  );
}

function CreateSkillDialog({
  agents,
  onClose,
  onCreated,
  open,
  projectId,
}: {
  agents: Agent[];
  onClose: () => void;
  onCreated: (skill: ProjectSkill) => void;
  open: boolean;
  projectId: string;
}) {
  const createSkill = useCreateProjectSkill(projectId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [assignedAgentIds, setAssignedAgentIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setDescription("");
    setMarkdown("");
    setAssignedAgentIds([]);
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function submit() {
    setError(null);
    try {
      const skill = await createSkill.mutateAsync({
        name,
        description,
        markdown,
        assignedAgentIds,
      });
      reset();
      onCreated(skill);
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
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New skill</DialogTitle>
          <DialogDescription>
            Create a project-local SKILL.md and choose which agents should receive it.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <Input
            autoFocus
            label="Name"
            onChange={(event) => setName(event.target.value)}
            placeholder="Review helper"
            value={name}
          />
          <Textarea
            onChange={(event) => setDescription(event.target.value)}
            placeholder="When should agents use this skill?"
            rows={3}
            value={description}
          />
          <Textarea
            className="font-mono"
            onChange={(event) => setMarkdown(event.target.value)}
            placeholder={"# Instructions\n\nWrite the reusable procedure here."}
            rows={10}
            value={markdown}
          />
          <AgentChecklist
            agents={agents}
            selectedAgentIds={assignedAgentIds}
            toggleAgent={toggleAgent}
          />
          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 type-body text-destructive-foreground">
              {error}
            </p>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <Button onClick={close} variant="ghost" disabled={createSkill.isPending}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || createSkill.isPending}
            onClick={submit}
            variant="primary"
          >
            {createSkill.isPending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
            Create skill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    return <p className="type-body text-mute">No agents in this project yet.</p>;
  }

  return (
    <div>
      <p className="mb-2 type-label text-mute">Assign to agents</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {agents.map((agent) => (
          <label
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-edge-soft bg-surface px-3 py-2 hover:bg-surface-2"
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
    </div>
  );
}

function SkillRow({
  agents,
  onOpen,
  skill,
}: {
  agents: Agent[];
  onOpen: () => void;
  skill: ProjectSkill;
}) {
  const trust = getTrustCopy(skill);
  const TrustIcon = trust.icon;
  const files = getFileInventory(skill);

  return (
    <TR
      className="cursor-pointer"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      tabIndex={0}
    >
      <TD>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{skill.name}</span>
            <span className="type-mono text-whisper">{skill.slug}</span>
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-mute">
            {skill.description || "No description"}
          </p>
        </div>
      </TD>
      <TD className="hidden md:table-cell">
        {agents.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {agents.slice(0, 3).map((agent) => (
              <Badge key={agent.id} variant="outline" size="sm">
                {agent.name}
              </Badge>
            ))}
            {agents.length > 3 ? <Badge variant="secondary" size="sm">+{agents.length - 3}</Badge> : null}
          </div>
        ) : (
          <span className="text-xs text-whisper">unused</span>
        )}
      </TD>
      <TD className="hidden lg:table-cell">
        <OriginBadge sourceType={skill.sourceType} />
      </TD>
      <TD>
        <Badge variant={trust.variant} size="sm">
          <TrustIcon />
          {trust.label}
        </Badge>
      </TD>
      <TD className="hidden md:table-cell">
        <span className="type-mono text-mute">{files.length}</span>
      </TD>
    </TR>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BookOpenIcon;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-edge-soft bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="type-label text-mute">{label}</span>
        <Icon className="size-4 text-mute" />
      </div>
      <p className="mt-2 type-numeral text-ink">{value}</p>
    </div>
  );
}

function OriginBadge({ sourceType }: { sourceType: string }) {
  if (sourceType === "global") {
    return <Badge variant="info" size="sm">Global</Badge>;
  }
  return <Badge variant="secondary" size="sm">Project</Badge>;
}

function SkillsSkeleton() {
  return (
    <div className="flex flex-col gap-[var(--gap-section)]">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="grid gap-[var(--gap-block)] md:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}

function buildAssignments(agents: Agent[]) {
  const map = new Map<string, Agent[]>();
  for (const agent of agents) {
    for (const slug of agent.desiredSkills ?? []) {
      const list = map.get(slug) ?? [];
      list.push(agent);
      map.set(slug, list);
    }
  }
  return map;
}

function countUsed(skills: ProjectSkill[], assignments: Map<string, Agent[]>) {
  return skills.filter((skill) => (assignments.get(skill.slug)?.length ?? 0) > 0).length;
}

function getFileInventory(skill: ProjectSkill): FileInventoryItem[] {
  if (Array.isArray(skill.fileInventory)) {
    return skill.fileInventory as FileInventoryItem[];
  }
  return [];
}

function getTrustCopy(skill: ProjectSkill) {
  return TRUST_COPY[skill.trustLevel] ?? TRUST_COPY.markdown_only;
}

export const Route = createFileRoute("/projects/$projectSlug/skills/")({
  component: SkillsPage,
});
