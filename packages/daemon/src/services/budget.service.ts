import { eq, and } from "drizzle-orm";
import { projects, agents } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";

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
