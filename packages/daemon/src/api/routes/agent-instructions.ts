import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { z } from "zod";
import { agents } from "@orch/shared/db";
import { and, eq } from "drizzle-orm";
import { agentsMdPath, heartbeatMdPath, agentDir } from "../../services/agent-files.js";
import "../../types.js";

const WriteInstructionsSchema = z.object({
  agentsMd: z.string().optional(),
  heartbeatMd: z.string().optional(),
});

// Defense-in-depth: restrict agent slugs to a conservative charset before we
// ever touch the filesystem. Rejects traversal attempts like `..`, absolute
// paths, or URL-encoded segments that a router decoder might turn into `/`.
const SLUG_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;

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

/**
 * Verifies that the resolved instruction paths stay within the project home
 * directory. Returns true iff every path in `paths` is a descendant of
 * `projectHome`. Used as the last line of defense after slug validation.
 */
function pathsWithinRoot(projectHome: string, paths: string[]): boolean {
  const root = resolve(projectHome);
  const rootPrefix = root.endsWith(sep) ? root : root + sep;
  return paths.every((p) => {
    const resolved = resolve(p);
    return resolved === root || resolved.startsWith(rootPrefix);
  });
}

export async function agentInstructionRoutes(app: FastifyInstance) {
  app.get(
    "/api/agents/:id/instructions",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const projectId = request.projectId;
      if (!projectId) {
        return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
      }

      const slug = request.params.id;
      if (!SLUG_PATTERN.test(slug)) {
        return reply.code(400).send({ error: "validation_error", message: "Invalid agent id" });
      }

      const project = await app.projectService.getById(projectId);
      if (!project) return reply.code(404).send({ error: "not_found" });

      // Confirm the agent row exists for (slug, projectId) before reading files.
      const [existing] = await app.db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.id, slug), eq(agents.projectId, projectId)))
        .limit(1);
      if (!existing) return reply.code(404).send({ error: "not_found" });

      const agentsPath = agentsMdPath(project.homeDir, slug);
      const heartbeatPath = heartbeatMdPath(project.homeDir, slug);
      if (!pathsWithinRoot(project.homeDir, [agentsPath, heartbeatPath])) {
        return reply.code(400).send({ error: "validation_error", message: "Invalid agent id" });
      }

      const [agentsMd, heartbeatMd] = await Promise.all([
        readOrEmpty(agentsPath),
        readOrEmpty(heartbeatPath),
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

      const slug = request.params.id;
      if (!SLUG_PATTERN.test(slug)) {
        return reply.code(400).send({ error: "validation_error", message: "Invalid agent id" });
      }

      const project = await app.projectService.getById(projectId);
      if (!project) return reply.code(404).send({ error: "not_found" });

      // Confirm the agent row exists for (slug, projectId) before writing files.
      const [existing] = await app.db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.id, slug), eq(agents.projectId, projectId)))
        .limit(1);
      if (!existing) return reply.code(404).send({ error: "not_found" });

      const parsed = WriteInstructionsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
      }

      const agentDirPath = agentDir(project.homeDir, slug);
      const agentsPath = agentsMdPath(project.homeDir, slug);
      const heartbeatPath = heartbeatMdPath(project.homeDir, slug);
      if (!pathsWithinRoot(project.homeDir, [agentDirPath, agentsPath, heartbeatPath])) {
        return reply.code(400).send({ error: "validation_error", message: "Invalid agent id" });
      }

      await mkdir(agentDirPath, { recursive: true });

      if (parsed.data.agentsMd !== undefined) {
        await atomicWrite(agentsPath, parsed.data.agentsMd);
      }
      if (parsed.data.heartbeatMd !== undefined) {
        await atomicWrite(heartbeatPath, parsed.data.heartbeatMd);
      }

      return { ok: true };
    },
  );
}
