import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { ADAPTER_TYPES } from "@orch/shared";
import { projects } from "@orch/shared/db";
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
      if (request.params.type === "codex_local" &&
          typeof parsed.data.config === "object" && parsed.data.config !== null &&
          "sandboxOnly" in parsed.data.config) {
        if (!request.isAdmin) return reply.code(403).send({ error: "forbidden", message: "Admin only" });
        const settings = parsed.data.config as Record<string, unknown>;
        if (settings.sandboxOnly !== true || settings.sandbox !== "workspace-write" ||
            settings.dangerouslyBypassApprovalsAndSandbox !== false ||
            Object.keys(settings).some(key => !["sandboxOnly", "sandbox", "dangerouslyBypassApprovalsAndSandbox"].includes(key))) {
          return reply.code(400).send({ error: "validation_error", message: "Unsafe Codex sandbox check configuration" });
        }
        return adapter.testEnvironment(settings);
      }
      if (request.params.type === "claude_local") {
        if (!request.isAdmin) return reply.code(403).send({ error: "forbidden", message: "Admin only" });
        if (!parsed.data.projectId) return reply.code(400).send({ error: "validation_error", message: "Project required" });
        const project = await app.projectService.getById(parsed.data.projectId);
        if (!project) return reply.code(404).send({ error: "not_found", message: "Project not found" });
        if (project.budgetPaused || (project.budgetLimitUsd !== null && project.budgetSpentUsd >= project.budgetLimitUsd)) {
          return reply.code(403).send({ error: "budget_exhausted", message: "Project budget paused or exhausted" });
        }
        const config = parsed.data.config;
        if (!config || typeof config !== "object" || Array.isArray(config) || "cwd" in config ||
          "command" in config || "extraArgs" in config || "env" in config ||
          "dangerouslySkipPermissions" in config && config.dangerouslySkipPermissions !== false) {
          return reply.code(400).send({ error: "validation_error", message: "Unsafe Claude runtime configuration" });
        }
        const result = await adapter.testEnvironment({ ...config, cwd: project.homeDir });
        // Preflight is a real, billable model invocation. Count it even when
        // permissions or authentication prevent the shell marker from appearing.
        if (result.costUsd && result.costUsd > 0) {
          await app.db.update(projects).set({
            budgetSpentUsd: sql`${projects.budgetSpentUsd} + ${result.costUsd}`,
            updatedAt: new Date(),
          }).where(eq(projects.id, parsed.data.projectId));
        }
        return result;
      }
      return adapter.testEnvironment(parsed.data.config ?? {});
    },
  );
}
