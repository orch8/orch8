import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { spawn as nodeSpawn } from "node:child_process";
import { healthRoutes } from "./api/routes/health.js";
import { taskRoutes } from "./api/routes/tasks.js";
import { brainstormRoutes } from "./api/routes/brainstorm.js";
import { websocketRoutes } from "./api/websocket.js";
import { authPlugin } from "./api/middleware/auth.js";
import { BrainstormService } from "./services/brainstorm.service.js";
import { createDbClient } from "./db/client.js";
import "./types.js";

export interface ServerOptions {
  databaseUrl?: string;
  spawnFn?: typeof nodeSpawn;
}

export function buildServer(options: ServerOptions = {}) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  app.register(websocket);

  // Health check is always available (no auth required)
  app.register(healthRoutes);

  if (options.databaseUrl) {
    const dbClient = createDbClient(options.databaseUrl);
    app.decorate("db", dbClient.db);
    app.addHook("onClose", async () => {
      await dbClient.close();
    });

    // WebSocket broadcast helper
    const connectedSockets = new Set<import("ws").WebSocket>();
    function broadcast(_projectId: string, message: unknown) {
      const data = JSON.stringify(message);
      for (const socket of connectedSockets) {
        if (socket.readyState === 1) {
          socket.send(data);
        }
      }
    }
    app.decorate("connectedSockets", connectedSockets);
    app.decorate("broadcast", broadcast);

    // Brainstorm service
    const spawnFn = options.spawnFn ?? nodeSpawn;
    const brainstormService = new BrainstormService(dbClient.db, broadcast, spawnFn);
    app.decorate("brainstormService", brainstormService);

    // Auth middleware + routes that require DB
    app.register(authPlugin);
    app.register(taskRoutes);
    app.register(brainstormRoutes);
  }

  app.register(websocketRoutes);

  return app;
}
