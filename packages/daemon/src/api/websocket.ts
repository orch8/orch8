import type { FastifyInstance } from "fastify";

export async function websocketRoutes(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, (socket, _request) => {
    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString());

        if (message.type === "ping") {
          socket.send(JSON.stringify({ type: "pong" }));
        }
      } catch {
        socket.send(JSON.stringify({ type: "error", message: "invalid JSON" }));
      }
    });
  });
}
