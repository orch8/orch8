import type { FastifyInstance } from "fastify";

/**
 * WebSocket upgrade handler for /ws.
 *
 * Auth model (runs after the auth plugin's onRequest hook, which has already
 * populated request.agent / request.isAdmin):
 *
 *   - Agent-authenticated clients (Authorization: Bearer agent token): the socket
 *     is scoped to the agent's own projectId. A projectId query param, if given,
 *     must match.
 *   - Admin clients (currently localhost): the socket is scoped to the projectId
 *     provided in the query string. A missing projectId is allowed and yields a
 *     system-only scope (daemon:log / daemon:stats only).
 *   - Anything else is rejected by the auth hook before we get here.
 *
 * Registration goes through BroadcastService.register so broadcasts can filter
 * by scope (release blockers 1.1 + 1.2).
 */
export async function websocketRoutes(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, (socket, request) => {
    const query = (request.query as Record<string, string | undefined>) ?? {};
    const queryProjectId = query.projectId;

    let scopedProjectId: string | undefined;
    let isAdmin = false;

    if (request.agent) {
      // Agent auth: socket MUST be scoped to the agent's project.
      scopedProjectId = request.agent.projectId;
      if (queryProjectId && queryProjectId !== scopedProjectId) {
        socket.close(1008, "projectId query does not match authenticated agent");
        return;
      }
    } else if (request.isAdmin) {
      // Admin auth: scope to whatever project the query asks for, or none (system-only).
      isAdmin = true;
      scopedProjectId = queryProjectId;
    } else {
      // Defensive — the auth plugin should have already rejected unauthenticated callers.
      socket.close(1008, "unauthenticated");
      return;
    }

    app.broadcastService.register(socket, {
      projectId: scopedProjectId,
      isAdmin,
    });

    socket.on("close", () => {
      app.broadcastService.unregister(socket);
    });

    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString());

        if (message.type === "ping") {
          socket.send(JSON.stringify({ type: "pong" }));
          return;
        }
      } catch {
        socket.send(JSON.stringify({ type: "error", message: "invalid JSON" }));
      }
    });
  });
}
