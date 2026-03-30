import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { and, eq } from "drizzle-orm";
import { agents } from "@orch/shared/db";
import "../../types.js";

export const authPlugin = fp(async function authPlugin(app: FastifyInstance) {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const agentId = request.headers["x-agent-id"] as string | undefined;
    const projectId = request.headers["x-project-id"] as string | undefined;
    const runId = request.headers["x-run-id"] as string | undefined;

    // Agent auth path
    if (agentId && projectId) {
      const [agent] = await app.db
        .select()
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)));

      if (!agent) {
        return reply.code(403).send({
          error: "forbidden",
          message: `Agent '${agentId}' does not belong to project '${projectId}'`,
        });
      }

      request.agent = agent;
      request.projectId = projectId;
      request.runId = runId;
      return;
    }

    // Admin auth path (localhost only)
    const remoteIp = request.ip;
    const isLocalhost = remoteIp === "127.0.0.1" || remoteIp === "::1" || remoteIp === "::ffff:127.0.0.1";

    if (!isLocalhost) {
      return reply.code(403).send({
        error: "forbidden",
        message: "Dashboard access is restricted to localhost",
      });
    }

    request.isAdmin = true;
    request.projectId = projectId ?? (request.query as Record<string, string>)?.project ?? undefined;
  });
});
