import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { healthRoutes } from "./api/routes/health.js";
import { websocketRoutes } from "./api/websocket.js";
import { createDbClient } from "./db/client.js";

export interface ServerOptions {
  databaseUrl?: string;
}

export function buildServer(options: ServerOptions = {}) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  app.register(websocket);

  if (options.databaseUrl) {
    const dbClient = createDbClient(options.databaseUrl);
    app.decorate("db", dbClient);
    app.addHook("onClose", async () => {
      await dbClient.close();
    });
  }

  app.register(healthRoutes);
  app.register(websocketRoutes);

  return app;
}
