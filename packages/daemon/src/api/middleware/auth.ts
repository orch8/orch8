import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { eq } from "drizzle-orm";
import { agents } from "@orch/shared/db";
import { adminTokenMatches, extractBearerToken } from "./admin-token.js";
import { hashAgentToken } from "./agent-token.js";
import "../../types.js";

export interface AuthPluginOptions {
  /**
   * Canonical admin token, loaded from ~/.orch8/admin-token at startup.
   * When `null`, admin authentication via Bearer header is disabled —
   * only the localhost shortcut (if enabled) grants admin access.
   */
  adminToken?: string | null;
  /**
   * Gate the IP-based localhost-admin shortcut. When false (the safe
   * default), non-agent requests must present a valid Bearer admin
   * token regardless of source IP. Controlled by config
   * `auth.allow_localhost_admin`.
   */
  allowLocalhostAdmin?: boolean;
}

export const authPlugin = fp<AuthPluginOptions>(async function authPlugin(
  app: FastifyInstance,
  opts: AuthPluginOptions = {},
) {
  const adminToken = opts.adminToken ?? null;
  const allowLocalhostAdmin = opts.allowLocalhostAdmin ?? false;

  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const projectId = request.headers["x-project-id"] as string | undefined;
    const runId = request.headers["x-run-id"] as string | undefined;
    const authHeader = request.headers["authorization"] as string | undefined;
    const suppliedBearer = extractBearerToken(authHeader);

    // Agent auth path: the bearer token identifies the agent and project.
    if (suppliedBearer) {
      const suppliedHash = hashAgentToken(suppliedBearer);
      const [agent] = await app.db
        .select()
        .from(agents)
        .where(eq(agents.agentTokenHash, suppliedHash));

      if (agent) {
        request.agent = agent;
        request.projectId = agent.projectId;
        request.runId = runId;
        return;
      }
    }

    // Admin auth path
    // 1. Bearer-token match is the primary, secure path.
    if (adminToken && suppliedBearer && adminTokenMatches(suppliedBearer, adminToken)) {
      request.isAdmin = true;
      request.projectId =
        projectId ?? (request.query as Record<string, string>)?.projectId ?? undefined;
      return;
    }

    // 2. Optional loopback bypass (config.auth.allow_localhost_admin=true).
    //    Off by default so 0.0.0.0 binds don't accidentally grant admin to
    //    the whole LAN.
    if (allowLocalhostAdmin) {
      const remoteIp = request.ip;
      const isLocalhost =
        remoteIp === "127.0.0.1" ||
        remoteIp === "::1" ||
        remoteIp === "::ffff:127.0.0.1";
      if (isLocalhost) {
        request.isAdmin = true;
        request.projectId =
          projectId ?? (request.query as Record<string, string>)?.projectId ?? undefined;
        return;
      }
    }

    return reply.code(401).send({
      error: "unauthorized",
      message: "Admin authentication required",
    });
  });
});
