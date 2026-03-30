import type { FastifyInstance } from "fastify";
import { HealthStatusSchema } from "@orch/shared";

const startedAt = Date.now();

export async function healthRoutes(app: FastifyInstance) {
  app.get("/api/health", async (_request, _reply) => {
    const response = {
      status: "ok" as const,
      version: "0.0.0",
      uptime: Math.floor((Date.now() - startedAt) / 1000),
    };

    HealthStatusSchema.parse(response);
    return response;
  });
}
