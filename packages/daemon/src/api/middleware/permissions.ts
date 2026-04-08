import type { FastifyRequest, FastifyReply } from "fastify";

type Permission = "create_task" | "move_task" | "assign_task";

export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Admin requests bypass permission checks
    if (request.isAdmin) return;

    const agent = request.agent;
    if (!agent) {
      return reply.code(401).send({ error: "unauthorized", message: "Authentication required" });
    }

    switch (permission) {
      case "create_task": {
        if (!agent.canCreateTasks) {
          return reply.code(403).send({
            error: "forbidden",
            message: `Agent '${agent.id}' does not have task creation permission`,
          });
        }
        break;
      }

      case "move_task": {
        const body = request.body as Record<string, unknown> | null;
        const targetColumn = body?.column as string | undefined;
        const allowedColumns = agent.canMoveTo ?? [];
        type TaskColumn = NonNullable<typeof agent.canMoveTo>[number];
        if (targetColumn && !allowedColumns.includes(targetColumn as TaskColumn)) {
          return reply.code(403).send({
            error: "forbidden",
            message: `Agent '${agent.id}' cannot move tasks to '${targetColumn}'`,
          });
        }
        break;
      }

      case "assign_task": {
        const body = request.body as Record<string, unknown> | null;
        const targetAgent = body?.assignee as string | undefined;
        const allowed = agent.canAssignTo ?? [];
        // "*" acts as a wildcard — grants assignment to any agent ID.
        if (targetAgent && !allowed.includes("*") && !allowed.includes(targetAgent)) {
          return reply.code(403).send({
            error: "forbidden",
            message: `Agent '${agent.id}' cannot assign tasks to '${targetAgent}'`,
          });
        }
        break;
      }
    }
  };
}
