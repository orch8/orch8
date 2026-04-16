import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { agentsMdPath, heartbeatMdPath, agentDir } from "../../services/agent-files.js";
import "../../types.js";

const WriteInstructionsSchema = z.object({
  agentsMd: z.string().optional(),
  heartbeatMd: z.string().optional(),
});

async function readOrEmpty(path: string): Promise<string> {
  if (!existsSync(path)) return "";
  return readFile(path, "utf-8");
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, content, "utf-8");
  await rename(tmp, path);
}

export async function agentInstructionRoutes(app: FastifyInstance) {
  app.get(
    "/api/agents/:id/instructions",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const projectId = request.projectId;
      if (!projectId) {
        return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
      }
      const project = await app.projectService.getById(projectId);
      if (!project) return reply.code(404).send({ error: "not_found" });

      const slug = request.params.id;
      const [agentsMd, heartbeatMd] = await Promise.all([
        readOrEmpty(agentsMdPath(project.homeDir, slug)),
        readOrEmpty(heartbeatMdPath(project.homeDir, slug)),
      ]);
      return { agentsMd, heartbeatMd };
    },
  );

  app.put(
    "/api/agents/:id/instructions",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const projectId = request.projectId;
      if (!projectId) {
        return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
      }
      const project = await app.projectService.getById(projectId);
      if (!project) return reply.code(404).send({ error: "not_found" });

      const parsed = WriteInstructionsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
      }

      const slug = request.params.id;
      await mkdir(agentDir(project.homeDir, slug), { recursive: true });

      if (parsed.data.agentsMd !== undefined) {
        await atomicWrite(agentsMdPath(project.homeDir, slug), parsed.data.agentsMd);
      }
      if (parsed.data.heartbeatMd !== undefined) {
        await atomicWrite(heartbeatMdPath(project.homeDir, slug), parsed.data.heartbeatMd);
      }

      return { ok: true };
    },
  );
}
