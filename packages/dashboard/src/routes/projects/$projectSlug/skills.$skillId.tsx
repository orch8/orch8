import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckIcon,
  FileTextIcon,
  FolderIcon,
  HardDriveIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";
import { useAgents } from "../../../hooks/useAgents.js";
import {
  useDeleteProjectSkill,
  useProjectSkill,
} from "../../../hooks/useProjectSkills.js";
import { Badge } from "../../../components/ui/Badge.js";
import { Button } from "../../../components/ui/Button.js";
import { PageHeader } from "../../../components/ui/PageHeader.js";
import { Skeleton } from "../../../components/ui/Skeleton.js";
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const assignedAgents = useMemo(
    () =>
      skill
        ? agents.filter((agent) => agent.desiredSkills?.includes(skill.slug))
        : [],
    [agents, skill],
  );

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

  async function handleDelete() {
    await deleteSkill.mutateAsync(currentSkillId);
    navigate({
      to: "/projects/$projectSlug/skills",
      params: { projectSlug: projectId },
    });
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
          canDelete ? (
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
          ) : null
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
          <div className="p-5 md:p-6">
            <MarkdownRenderer
              className="prose-headings:scroll-mt-20 prose-pre:max-w-full prose-pre:overflow-x-auto"
              content={stripFrontmatter(skill.markdown)}
              projectSlug={projectId}
            />
          </div>
        </main>

        <aside className="space-y-5">
          <SidebarSection title="Used by">
            {assignedAgents.length > 0 ? (
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
