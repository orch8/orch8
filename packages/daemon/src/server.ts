import Fastify from "fastify";
import { healthRoutes } from "./api/routes/health.js";

export function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  app.register(healthRoutes);

  return app;
}
