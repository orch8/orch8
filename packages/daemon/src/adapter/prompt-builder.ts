// packages/daemon/src/adapter/prompt-builder.ts
import type { RunContext } from "./types.js";

export function interpolateTemplate(
  template: string,
  vars: Record<string, string | undefined>,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
    return vars[key.trim()] ?? "";
  });
}

function contextToVars(ctx: RunContext): Record<string, string | undefined> {
  const vars: Record<string, string | undefined> = {
    agentId: ctx.agentId,
    "agent.id": ctx.agentId,
    "agent.name": ctx.agentName,
    projectId: ctx.projectId,
    "project.id": ctx.projectId,
    runId: ctx.runId,
    "run.id": ctx.runId,
    "run.source": ctx.wakeReason,
    "task.title": ctx.taskTitle,
    "task.description": ctx.taskDescription,
    "task.phase": ctx.taskPhase,
    "task.researchOutput": ctx.taskResearchOutput,
    "task.planOutput": ctx.taskPlanOutput,
    "task.brainstormTranscript": ctx.brainstormTranscript,

    // Workspace metadata (Phase 3)
    "workspace.branch": ctx.workspaceBranch,
    "workspace.repoUrl": ctx.workspaceRepoUrl,
    "workspace.worktreePath": ctx.worktreePath,

    // Wake trigger details (Phase 3)
    "wake.commentId": ctx.wakeCommentId,

    // Task linkage (Phase 3)
    "task.linkedIssueIds": ctx.linkedIssueIds,
  };

  // Add context.* variables
  if (ctx.context) {
    for (const [key, value] of Object.entries(ctx.context)) {
      vars[`context.${key}`] = value;
    }
  }

  return vars;
}

export interface BuildPromptInput {
  heartbeatTemplate: string;
  bootstrapTemplate?: string;
  sessionHandoff?: string;
  context: RunContext;
  isFirstRun: boolean;
}

export function buildPrompt(input: BuildPromptInput): string {
  const vars = contextToVars(input.context);
  const sections: string[] = [];

  // Bootstrap prompt — only on first run (spec §6)
  if (input.isFirstRun && input.bootstrapTemplate) {
    sections.push(interpolateTemplate(input.bootstrapTemplate, vars));
  }

  // Session handoff
  if (input.sessionHandoff) {
    sections.push(input.sessionHandoff);
  }

  // Heartbeat prompt — always present
  sections.push(interpolateTemplate(input.heartbeatTemplate, vars));

  return sections.join("\n\n");
}
