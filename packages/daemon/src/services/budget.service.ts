import { eq, and } from "drizzle-orm";
import { projects, agents } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import type { BroadcastService } from "./broadcast.service.js";

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
}

export async function checkBudget(
  db: SchemaDb,
  agentId: string,
  projectId: string,
): Promise<BudgetCheckResult> {
  // 1. Project-level checks (spec §9 — project checks first)
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project) {
    return { allowed: false, reason: "Project not found" };
  }
  if (project.budgetPaused) {
    return { allowed: false, reason: "Project budget paused" };
  }
  if (
    project.budgetLimitUsd !== null &&
    project.budgetSpentUsd >= project.budgetLimitUsd
  ) {
    return { allowed: false, reason: "Project budget exhausted" };
  }

  // 2. Agent-level checks
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)));

  if (!agent) {
    return { allowed: false, reason: "Agent not found" };
  }
  if (agent.budgetPaused) {
    return { allowed: false, reason: "Agent budget paused" };
  }
  if (
    agent.budgetLimitUsd !== null &&
    agent.budgetSpentUsd >= agent.budgetLimitUsd
  ) {
    return { allowed: false, reason: "Agent budget exhausted" };
  }

  return { allowed: true };
}

export interface AutoPauseResult {
  agentPaused: boolean;
  projectPaused: boolean;
}

export async function autoPauseIfExhausted(
  db: SchemaDb,
  agentId: string,
  projectId: string,
  broadcastService?: BroadcastService,
): Promise<AutoPauseResult> {
  const result: AutoPauseResult = { agentPaused: false, projectPaused: false };

  // Check project budget
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (
    project &&
    project.budgetLimitUsd !== null &&
    project.budgetSpentUsd >= project.budgetLimitUsd &&
    !project.budgetPaused
  ) {
    await db
      .update(projects)
      .set({ budgetPaused: true, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
    result.projectPaused = true;
    broadcastService?.budgetAlert(projectId, {
      level: "project",
      entityId: projectId,
      message: "Project budget exhausted — auto-paused",
      budgetLimitUsd: project.budgetLimitUsd,
      budgetSpentUsd: project.budgetSpentUsd,
    });
  } else if (project?.budgetPaused) {
    result.projectPaused = true;
  }

  // Check agent budget
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)));

  if (
    agent &&
    agent.budgetLimitUsd !== null &&
    agent.budgetSpentUsd >= agent.budgetLimitUsd &&
    !agent.budgetPaused
  ) {
    await db
      .update(agents)
      .set({
        budgetPaused: true,
        pauseReason: "budget",
        status: "paused",
        updatedAt: new Date(),
      })
      .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)));
    result.agentPaused = true;
    broadcastService?.budgetAlert(projectId, {
      level: "agent",
      entityId: agentId,
      message: "Agent budget exhausted — auto-paused",
      budgetLimitUsd: agent.budgetLimitUsd,
      budgetSpentUsd: agent.budgetSpentUsd,
    });
  } else if (agent?.budgetPaused) {
    result.agentPaused = true;
  }

  return result;
}
