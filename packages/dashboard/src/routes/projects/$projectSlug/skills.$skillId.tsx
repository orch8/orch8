import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckIcon,
  FileTextIcon,
  FolderIcon,
  HardDriveIcon,
  Loader2Icon,
  PencilIcon,
  SaveIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";
import { useAgents } from "../../../hooks/useAgents.js";
import {
  useDeleteProjectSkill,
  useProjectSkill,
  useUpdateProjectSkill,
} from "../../../hooks/useProjectSkills.js";
import { Badge } from "../../../components/ui/Badge.js";
import { Button } from "../../../components/ui/Button.js";
import { Input } from "../../../components/ui/Input.js";
import { PageHeader } from "../../../components/ui/PageHeader.js";
import { Skeleton } from "../../../components/ui/Skeleton.js";
import { Textarea } from "../../../components/ui/Textarea.js";
import { MarkdownRenderer } from "../../../components/shared/MarkdownRenderer.js";
import type { Agent, ProjectSkill } from "../../../types.js";

type FileInventoryItem = { path: string; kind: string };

const TRUST_COPY: Record<string, { label: string; variant: "success" | "warning" | "error"; icon: typeof ShieldCheckIcon }> = {
  markdown_only: { label: "Markdown", variant: "success", icon: ShieldCheckIcon },
  assets: { label: "Assets", variant: "warning", icon: ShieldCheckIcon },
  scripts_executables: { label: "Scripts", variant: "error", icon: ShieldAlertIcon },
};

function SkillDetailPage() {
  const { projectSlug: projectId, skillId } = Route.useParams();
  const navigate = useNavigate();
  const { data: skill, isLoading, isError, error } = useProjectSkill(projectId, skillId);
  const { data: agents = [] } = useAgents(projectId);
  const deleteSkill = useDeleteProjectSkill(projectId);
  const updateSkill = useUpdateProjectSkill(projectId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftMarkdown, setDraftMarkdown] = useState("");
  const [draftAgentIds, setDraftAgentIds] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  const assignedAgents = useMemo(
    () =>
      skill
        ? agents.filter((agent) => agent.desiredSkills?.includes(skill.slug))
        : [],
    [agents, skill],
  );

  useEffect(() => {
    if (!skill) return;
    if (isEditing) return;
    setDraftName(skill.name);
    setDraftDescription(skill.description ?? "");
    setDraftMarkdown(stripFrontmatter(skill.markdown));
    setDraftAgentIds(
      agents
        .filter((agent) => agent.desiredSkills?.includes(skill.slug))
        .map((agent) => agent.id),
    );
  }, [agents, isEditing, skill]);

  if (isLoading) {
    return <SkillDetailSkeleton />;
  }

  if (isError || !skill) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-center">
        <AlertTriangleIcon className="size-8 text-destructive-foreground" />
        <div>
          <p className="type-section text-ink">Skill not found</p>
          <p className="mt-1 type-body text-mute">
            {error instanceof Error ? error.message : "This skill may have been deleted or moved."}
          </p>
        </div>
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
          <ArrowLeftIcon />
          Back to skills
        </Button>
      </div>
    );
  }

  const trust = getTrustCopy(skill);
  const TrustIcon = trust.icon;
  const files = getFileInventory(skill);
  const canDelete = skill.sourceType !== "global";
  const currentSkillId = skill.id;
  const isDirty =
    draftName.trim() !== skill.name ||
    draftDescription.trim() !== (skill.description ?? "") ||
    draftMarkdown !== stripFrontmatter(skill.markdown) ||
    draftAgentIds.slice().sort().join("|") !== assignedAgents.map((a) => a.id).sort().join("|");

  async function handleDelete() {
    await deleteSkill.mutateAsync(currentSkillId);
    navigate({
      to: "/projects/$projectSlug/skills",
      params: { projectSlug: projectId },
    });
  }

  async function handleSave() {
    setSaveError(null);
    try {
      const updated = await updateSkill.mutateAsync({
        skillId: currentSkillId,
        name: draftName,
        description: draftDescription,
        markdown: draftMarkdown,
        assignedAgentIds: draftAgentIds,
      });
      setDraftName(updated.name);
      setDraftDescription(updated.description ?? "");
      setDraftMarkdown(stripFrontmatter(updated.markdown));
      setIsEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save skill");
    }
  }

  function handleDiscard() {
    if (!skill) return;
    setDraftName(skill.name);
    setDraftDescription(skill.description ?? "");
    setDraftMarkdown(stripFrontmatter(skill.markdown));
    setDraftAgentIds(assignedAgents.map((agent) => agent.id));
    setSaveError(null);
    setIsEditing(false);
  }

  function toggleDraftAgent(agentId: string) {
    setDraftAgentIds((current) =>
      current.includes(agentId)
        ? current.filter((id) => id !== agentId)
        : [...current, agentId],
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-[var(--gap-section)]">
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
        title={skill.name}
        subtitle={skill.description || "No description"}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isEditing ? (
              <>
                <Button onClick={handleDiscard} size="sm" variant="outline">
                  Discard
                </Button>
                <Button
                  disabled={!draftName.trim() || updateSkill.isPending || !isDirty}
                  onClick={handleSave}
                  size="sm"
                  variant="primary"
                >
                  {updateSkill.isPending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
                  Save
                </Button>
              </>
            ) : (
              <Button onClick={() => setIsEditing(true)} size="sm" variant="outline">
                <PencilIcon />
                Edit
              </Button>
            )}
            {canDelete ? (
              confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <span className="type-micro text-destructive-foreground">Delete this project skill?</span>
                  <Button
                    disabled={deleteSkill.isPending}
                    onClick={handleDelete}
                    size="sm"
                    variant="danger"
                  >
                    <CheckIcon />
                    Confirm
                  </Button>
                  <Button onClick={() => setConfirmingDelete(false)} size="sm" variant="outline">
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button onClick={() => setConfirmingDelete(true)} size="sm" variant="danger">
                  <Trash2Icon />
                  Delete
                </Button>
              )
            ) : null}
          </div>
        }
      />

      <div className="grid gap-[var(--gap-section)] lg:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="min-w-0 rounded-lg border border-edge-soft bg-surface">
          <div className="flex flex-wrap gap-2 border-b border-edge-soft p-4">
            <Badge variant="outline">{skill.slug}</Badge>
            <OriginBadge sourceType={skill.sourceType} />
            <Badge variant={trust.variant}>
              <TrustIcon />
              {trust.label}
            </Badge>
          </div>
          {isEditing ? (
            <div className="space-y-4 p-5 md:p-6">
              <Input
                label="Name"
                onChange={(event) => setDraftName(event.target.value)}
                value={draftName}
              />
              <Textarea
                onChange={(event) => setDraftDescription(event.target.value)}
                placeholder="When should agents use this skill?"
                rows={3}
                value={draftDescription}
              />
              <Textarea
                className="font-mono"
                onChange={(event) => setDraftMarkdown(event.target.value)}
                placeholder="# Instructions"
                rows={22}
                value={draftMarkdown}
              />
              {saveError ? (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 type-body text-destructive-foreground">
                  {saveError}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="p-5 md:p-6">
              <MarkdownRenderer
                className="prose-headings:scroll-mt-20 prose-pre:max-w-full prose-pre:overflow-x-auto"
                content={stripFrontmatter(skill.markdown)}
                projectSlug={projectId}
              />
            </div>
          )}
        </main>

        <aside className="space-y-5">
          <SidebarSection title="Used by">
            {isEditing ? (
              <AgentChecklist
                agents={agents}
                selectedAgentIds={draftAgentIds}
                toggleAgent={toggleDraftAgent}
              />
            ) : assignedAgents.length > 0 ? (
              <div className="flex flex-col gap-2">
                {assignedAgents.map((agent) => (
                  <AgentCard agent={agent} key={agent.id} />
                ))}
              </div>
            ) : (
              <p className="type-body text-mute">Not assigned to any agent.</p>
            )}
          </SidebarSection>

          <SidebarSection title="Files">
            <div className="flex flex-col gap-1.5">
              {files.map((file) => (
                <div
                  className="flex min-w-0 items-center gap-2 rounded-md border border-edge-soft bg-surface px-2 py-1.5"
                  key={file.path}
                >
                  {file.path === "SKILL.md" ? (
                    <FileTextIcon className="size-3.5 text-mute" />
                  ) : (
                    <FolderIcon className="size-3.5 text-mute" />
                  )}
                  <span className="truncate type-mono text-mute">{file.path}</span>
                </div>
              ))}
            </div>
          </SidebarSection>

          <SidebarSection title="Source">
            <div className="rounded-lg border border-edge-soft bg-surface p-3">
              <div className="flex items-center gap-2 type-body text-ink">
                <HardDriveIcon className="size-4 text-mute" />
                {skill.sourceType === "global" ? "Global skill" : "Project skill"}
              </div>
              {skill.sourceLocator ? (
                <p className="mt-2 break-all type-mono text-mute">{skill.sourceLocator}</p>
              ) : null}
            </div>
          </SidebarSection>
        </aside>
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Link
      className="block rounded-lg border border-edge-soft bg-surface p-3 hover:bg-surface-2"
      params={{ projectSlug: agent.projectId, agentId: agent.id }}
      to="/projects/$projectSlug/agents/$agentId"
    >
      <p className="type-body font-medium text-ink">{agent.name}</p>
      <p className="type-micro">{agent.role}</p>
    </Link>
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
    return <p className="type-body text-mute">No agents in this project.</p>;
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

function SidebarSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section>
      <h2 className="mb-2 type-label text-mute">{title}</h2>
      {children}
    </section>
  );
}

function OriginBadge({ sourceType }: { sourceType: string }) {
  if (sourceType === "global") {
    return <Badge variant="info">Global</Badge>;
  }
  return <Badge variant="secondary">Project</Badge>;
}

function SkillDetailSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-[var(--gap-section)]">
      <Skeleton className="h-8 w-32" />
      <div className="space-y-2">
        <Skeleton className="h-7 w-80" />
        <Skeleton className="h-4 w-[32rem] max-w-full" />
      </div>
      <div className="grid gap-[var(--gap-section)] lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-[34rem]" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}

function stripFrontmatter(markdown: string) {
  if (!markdown.startsWith("---")) return markdown;
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return markdown;
  return markdown.slice(end + 4).trimStart();
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

export const Route = createFileRoute("/projects/$projectSlug/skills/$skillId")({
  component: SkillDetailPage,
});
