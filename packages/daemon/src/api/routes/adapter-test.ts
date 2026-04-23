import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ADAPTER_TYPES } from "@orch/shared";
import { resolveAdapter } from "../../adapter/registry.js";
import "../../types.js";

const AdapterTestBodySchema = z.object({
  config: z.unknown().optional(),
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
      return adapter.testEnvironment(parsed.data.config ?? {});
    },
  );
}
