import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { CreateProjectSchema, UpdateProjectSchema, ProjectFilterSchema } from "@orch/shared";
import { isUniqueViolation } from "../utils/db-errors.js";
import { resolveProjectParam } from "../utils/project-resolver.js";
import "../../types.js";
import { z } from "zod";
import { featureBranchReadiness, inspectRepository } from "../../services/feature-branch.service.js";
import { requireProjectScope } from "../utils/project-scope.js";
import { open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FILE_MAX_BYTES = 32 * 1024;
const FILE_LIST_LIMIT = 500;

async function trackedFiles(homeDir: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["-c", "core.fsmonitor=false", "-C", homeDir, "ls-files", "-z", "--cached"], { encoding: "buffer", maxBuffer: 4 * 1024 * 1024 });
  return (stdout as Buffer).toString("utf8").split("\0").filter(Boolean);
}

function safeRelativePath(path: string): boolean {
  return path.length > 0 && path.length <= 1024 && !path.includes("\0") &&
    !path.split("/").some(part => !part || part === "." || part === ".." || part === ".git");
}

async function trackedPreview(homeDir: string, path: string): Promise<string | null> {
  const root = await realpath(homeDir);
  const target = join(root, path);
  // Prevent a tracked symlink directory or leaf from reaching outside the checkout.
  const canonical = await realpath(target);
  const within = relative(root, canonical);
  if (!within || within.startsWith("..") || isAbsolute(within) || canonical !== target) return null;
  let handle;
  try {
    handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > FILE_MAX_BYTES) return null;
    const buffer = Buffer.alloc(stat.size);
    const { bytesRead } = await handle.read(buffer, 0, stat.size, 0);
    if (bytesRead !== stat.size || buffer.includes(0)) return null;
    return buffer.toString("utf8");
  } finally { await handle?.close(); }
}

const README_MAX_BYTES = 64 * 1024;
const README_NAMES = ["README.md", "README.markdown", "README.txt", "README"] as const;

async function rootReadme(homeDir: string): Promise<{ filename: string | null; content: string | null }> {
  for (const filename of README_NAMES) {
    let handle;
    try {
      // Fixed root filenames only; refuse a symlink at the leaf rather than
      // following it into an unrelated file. Never accept a client path.
      handle = await open(join(homeDir, filename), constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > README_MAX_BYTES) return { filename: null, content: null };
      const buffer = Buffer.alloc(stat.size);
      const { bytesRead } = await handle.read(buffer, 0, stat.size, 0);
      if (bytesRead !== stat.size || buffer.includes(0)) return { filename: null, content: null };
      return { filename, content: buffer.toString("utf8") };
    } catch (err) {
      if (!["ENOENT", "ELOOP"].includes((err as NodeJS.ErrnoException).code ?? "")) return { filename: null, content: null };
    } finally {
      await handle?.close();
    }
  }
  return { filename: null, content: null };
}

export async function projectRoutes(app: FastifyInstance) {
  app.get("/api/projects/:id/repository-files", async (request: FastifyRequest<{ Params: { id: string }; Querystring: { path?: string; q?: string } }>, reply: FastifyReply) => {
    const projectId = await resolveProjectParam(app, request.params.id, reply);
    if (!projectId) return reply;
    if (!requireProjectScope(request, reply, projectId)) return reply;
    const project = await app.projectService.getById(projectId);
    if (!project) return reply.code(404).send({ error: "not_found" });
    const query = request.query;
    if (Object.keys(query).some(key => !["path", "q"].includes(key)) ||
      (query.path !== undefined && (typeof query.path !== "string" || !safeRelativePath(query.path))) ||
      (query.q !== undefined && (typeof query.q !== "string" || query.q.length > 120 || !!query.path)))
      return reply.code(400).send({ error: "invalid_path" });
    try {
      const files = await trackedFiles(project.homeDir);
      if (query.path) {
        if (!files.includes(query.path)) return reply.code(404).send({ error: "not_found" });
        const content = await trackedPreview(project.homeDir, query.path).catch(() => null);
        return { path: query.path, content };
      }
      const matches = files.filter(path => safeRelativePath(path) && path.toLowerCase().includes((query.q ?? "").toLowerCase()));
      return { paths: matches.slice(0, FILE_LIST_LIMIT), truncated: matches.length > FILE_LIST_LIMIT };
    } catch {
      return reply.code(422).send({ error: "repository_unavailable", message: "Could not inspect tracked repository files." });
    }
  });
  app.get("/api/projects/:id/repository-overview", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (Object.keys(request.query as object).length) return reply.code(400).send({ error: "validation_error", message: "This endpoint does not accept a file path." });
    const projectId = await resolveProjectParam(app, request.params.id, reply);
    if (!projectId) return reply;
    if (!requireProjectScope(request, reply, projectId)) return reply;
    const project = await app.projectService.getById(projectId);
    if (!project) return reply.code(404).send({ error: "not_found", message: "Project not found" });
    return rootReadme(project.homeDir);
  });
  app.post("/api/projects/repository-inspection", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.isAdmin) return reply.code(403).send({ error: "forbidden", message: "Admin only" });
    const parsed = z.object({ homeDir: z.string().min(1).max(4096) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
    try { return await inspectRepository(parsed.data.homeDir); }
    catch { return reply.code(400).send({ error: "invalid_repository", message: "Choose a repository root with a checked-out branch." }); }
  });
  // Check the checkout before project creation can provision files in it.
  app.post("/api/projects/repository-readiness", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.isAdmin) return reply.code(403).send({ error: "forbidden", message: "Admin only" });
    const parsed = z.object({ homeDir: z.string().min(1).max(4096), defaultBranch: z.string().min(1).max(200) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
    return featureBranchReadiness(parsed.data.homeDir, parsed.data.defaultBranch);
  });
  // POST /api/projects — Create project (admin only)
  app.post("/api/projects", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.isAdmin) {
      return reply.code(403).send({ error: "forbidden", message: "Admin only" });
    }

    const parsed = CreateProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
    }

    try {
      const project = await app.projectService.create(parsed.data);
      return reply.code(201).send(project);
    } catch (err) {
      if (isUniqueViolation(err, "projects_key_unique")) {
        return reply.code(409).send({ error: "conflict", message: "Project key already in use, pick another" });
      }
      if (isUniqueViolation(err, "projects_slug_unique") || isUniqueViolation(err)) {
        return reply.code(409).send({ error: "conflict", message: "Project with this slug already exists" });
      }
      if ((err as Error).message.includes("Project key")) {
        return reply.code(400).send({ error: "validation_error", message: (err as Error).message });
      }
      throw err;
    }
  });

  // GET /api/projects — List projects
  app.get("/api/projects", async (request: FastifyRequest) => {
    const parsed = ProjectFilterSchema.safeParse(request.query);
    const filter = parsed.success ? parsed.data : {};
    return app.projectService.list(filter);
  });

  // GET /api/projects/:id — Get project
  app.get("/api/projects/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const projectId = await resolveProjectParam(app, request.params.id, reply);
    if (!projectId) return reply;
    const project = await app.projectService.getById(projectId);
    if (!project) {
      return reply.code(404).send({ error: "not_found", message: "Project not found" });
    }
    return project;
  });

  // PATCH /api/projects/:id — Update project (admin only)
  app.patch("/api/projects/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (!request.isAdmin) {
      return reply.code(403).send({ error: "forbidden", message: "Admin only" });
    }

    const parsed = UpdateProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
    }

    try {
      const projectId = await resolveProjectParam(app, request.params.id, reply);
      if (!projectId) return reply;
      const project = await app.projectService.update(projectId, parsed.data);
      return project;
    } catch (err) {
      if ((err as Error).message === "Project not found") {
        return reply.code(404).send({ error: "not_found", message: "Project not found" });
      }
      throw err;
    }
  });

  // POST /api/projects/:id/archive — Archive project (admin only)
  app.post("/api/projects/:id/archive", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (!request.isAdmin) {
      return reply.code(403).send({ error: "forbidden", message: "Admin only" });
    }

    try {
      const projectId = await resolveProjectParam(app, request.params.id, reply);
      if (!projectId) return reply;
      const project = await app.projectService.archive(projectId);
      return project;
    } catch (err) {
      if ((err as Error).message === "Project not found") {
        return reply.code(404).send({ error: "not_found", message: "Project not found" });
      }
      throw err;
    }
  });
}
