// packages/daemon/src/api/routes/bundled-agents.ts
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AddBundledAgentsSchema } from "@orch/shared";
import "../../types.js";

export async function bundledAgentRoutes(app: FastifyInstance) {
  // GET /api/bundled-agents — List available bundled agent templates
  app.get("/api/bundled-agents", async () => {
    return app.seedingService.listBundledAgents();
  });

  // POST /api/bundled-agents/add — Add bundled agents to a project
  app.post(
    "/api/bundled-agents/add",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = AddBundledAgentsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation_error", details: parsed.error.issues });
      }

      const { projectId, agentIds } = parsed.data;

      // Verify project exists and get homeDir for file seeding
      const project = await app.projectService.getById(projectId);
      if (!project) {
        return reply
          .code(404)
          .send({ error: "not_found", message: "Project not found" });
      }

      // Copy skills + selected agent dirs to project's .orch8/
      await app.seedingService.copyDefaults(project.homeDir, agentIds);
      await app.seedingService.ensureGitignore(project.homeDir);

      // Parse copied agent definitions
      const agentDefs =
        await app.seedingService.parseAgentDefinitions(project.homeDir);

      const created = [];
      for (const def of agentDefs) {
        // Only create agents that were explicitly requested
        if (!agentIds.includes(def.name)) continue;

        const modelMap: Record<string, string> = {
          opus: "claude-opus-4-6",
          sonnet: "claude-sonnet-4-6",
          haiku: "claude-haiku-4-5-20251001",
        };

        try {
          const agent = await app.agentService.create({
            id: def.name,
            projectId,
            name: def.name,
            role: def.role as "cto" | "engineer" | "qa" | "researcher" | "planner" | "implementer" | "reviewer" | "verifier" | "referee" | "custom",
            model: modelMap[def.model] ?? def.model,
            effort: def.effort,
            maxTurns: def.maxTurns,
            systemPrompt: def.systemPrompt,
            promptTemplate: def.promptTemplate,
            bootstrapPromptTemplate: def.bootstrapPromptTemplate,
            instructionsFilePath: def.instructionsFilePath,
            skillPaths: def.resolvedSkillPaths,
            heartbeatEnabled: def.heartbeat.enabled,
            heartbeatIntervalSec: def.heartbeat.intervalSec,
          });
          created.push(agent);
        } catch (err) {
          const message = (err as Error).message;
          // Skip agents that already exist in the project
          if (message.includes("duplicate") || message.includes("unique")) {
            continue;
          }
          throw err;
        }
      }

      return reply.code(201).send(created);
    },
  );
}
