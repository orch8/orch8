import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";

export async function websocketRoutes(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, (socket, _request) => {
    // Track connected sockets for broadcast
    const sockets = (app as unknown as { connectedSockets?: Set<WebSocket> }).connectedSockets;
    if (sockets) {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    }

    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString());

        if (message.type === "ping") {
          socket.send(JSON.stringify({ type: "pong" }));
          return;
        }

        if (message.type === "brainstorm_message") {
          const { taskId, content } = message;
          if (!taskId || !content) {
            socket.send(JSON.stringify({
              type: "error",
              message: "brainstorm_message requires taskId and content",
            }));
            return;
          }

          // Forward to brainstorm service if available
          if ("brainstormService" in app) {
            const bs = (app as unknown as { brainstormService: { sendMessage: (taskId: string, content: string) => Promise<void> } }).brainstormService;
            bs.sendMessage(taskId, content).catch((err) => {
              socket.send(JSON.stringify({
                type: "error",
                message: (err as Error).message,
              }));
            });
          }
          return;
        }
      } catch {
        socket.send(JSON.stringify({ type: "error", message: "invalid JSON" }));
      }
    });
  });
}
