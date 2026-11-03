import type { FastifyReply, FastifyRequest } from "fastify";
import "../../types.js";

/** Authorize persisted ownership, independently of capabilities and claimed identity. */
export function requireProjectScope(
  request: FastifyRequest,
  reply: FastifyReply,
  resourceProjectId: string,
): boolean {
  if (request.isAdmin) return true;
  if (!request.agent) {
    reply.code(401).send({ error: "unauthorized", message: "Authentication required" });
    return false;
  }
  if (!request.agent.projectId || request.projectId !== request.agent.projectId ||
      resourceProjectId !== request.agent.projectId) {
    reply.code(403).send({ error: "forbidden", message: "Project access denied" });
    return false;
  }
  return true;
}
