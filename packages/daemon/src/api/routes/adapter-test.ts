import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ADAPTER_TYPES } from "@orch/shared";
import { resolveAdapter } from "../../adapter/registry.js";
import "../../types.js";

const AdapterTestBodySchema = z.object({
  config: z.unknown().optional(),
  projectId: z.string().optional(),
});

export async function adapterTestRoutes(app: FastifyInstance) {
  app.post(
    "/api/adapter/:type/test-environment",
    async (
      request: FastifyRequest<{ Params: { type: string } }>,
      reply: FastifyReply,
    ) => {
      if (!ADAPTER_TYPES.includes(request.params.type as (typeof ADAPTER_TYPES)[number])) {
        return reply.code(400).send({
          error: "validation_error",
          message: `adapter type must be one of: ${ADAPTER_TYPES.join(", ")}`,
        });
      }

      const parsed = AdapterTestBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
      }

      const adapter = resolveAdapter(request.params.type, app.adapters, request.log);
      if (request.params.type === "claude_local") {
        if (!request.isAdmin) return reply.code(403).send({ error: "forbidden", message: "Admin only" });
        if (!parsed.data.projectId) return reply.code(400).send({ error: "validation_error", message: "Project required" });
        const project = await app.projectService.getById(parsed.data.projectId);
        if (!project) return reply.code(404).send({ error: "not_found", message: "Project not found" });
        const config = parsed.data.config;
        if (!config || typeof config !== "object" || Array.isArray(config) || "cwd" in config ||
          "command" in config || "extraArgs" in config || "env" in config ||
          "dangerouslySkipPermissions" in config && config.dangerouslySkipPermissions !== false) {
          return reply.code(400).send({ error: "validation_error", message: "Unsafe Claude runtime configuration" });
        }
        return adapter.testEnvironment({ ...config, cwd: project.homeDir });
      }
      return adapter.testEnvironment(parsed.data.config ?? {});
    },
  );
}
