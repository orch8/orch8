import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, and } from "drizzle-orm";
import { projects, tasks } from "@orch/shared/db";
import "../../types.js";

export async function identityRoutes(app: FastifyInstance) {
  // GET /api/identity — Returns agent config, permissions, current task, project info, budget
  app.get("/api/identity", async (request: FastifyRequest, reply: FastifyReply) => {
    // Admin context
    if (request.isAdmin) {
      let project = null;
      if (request.projectId) {
        const [p] = await app.db.select().from(projects).where(eq(projects.id, request.projectId));
        project = p ?? null;
      }
      return {
        isAdmin: true,
        agent: null,
        permissions: null,
        currentTask: null,
        project,
        budget: project ? {
          projectLimit: project.budgetLimitUsd,
          projectSpent: project.budgetSpentUsd,
          agentLimit: null,
          agentSpent: null,
        } : null,
      };
    }

    // Agent context
    const agent = request.agent;
    if (!agent) {
      return reply.code(401).send({ error: "unauthorized", message: "Authentication required" });
    }

    // Fetch project
    const [project] = await app.db.select().from(projects).where(eq(projects.id, agent.projectId));

    // Find current task (in_progress assigned to this agent)
    const [currentTask] = await app.db
      .select({ id: tasks.id, title: tasks.title, column: tasks.column, taskType: tasks.taskType, complexPhase: tasks.complexPhase })
      .from(tasks)
      .where(
        and(
          eq(tasks.executionAgentId, agent.id),
          eq(tasks.projectId, agent.projectId),
          eq(tasks.column, "in_progress"),
        ),
      );

    return {
      isAdmin: false,
      agent: {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        status: agent.status,
        model: agent.model,
        maxTurns: agent.maxTurns,
      },
      permissions: {
        canCreateTasks: agent.canCreateTasks,
        canMoveTo: agent.canMoveTo,
        canAssignTo: agent.canAssignTo,
      },
      currentTask: currentTask ?? null,
      project: project ? {
        id: project.id,
        name: project.name,
        slug: project.slug,
        homeDir: project.homeDir,
        budgetLimitUsd: project.budgetLimitUsd,
      } : null,
      budget: {
        projectLimit: project?.budgetLimitUsd ?? null,
        projectSpent: project?.budgetSpentUsd ?? null,
        agentLimit: agent.budgetLimitUsd,
        agentSpent: agent.budgetSpentUsd,
      },
    };
  });
}
