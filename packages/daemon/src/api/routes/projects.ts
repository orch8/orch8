import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { CreateProjectSchema, UpdateProjectSchema, ProjectFilterSchema } from "@orch/shared";
import { isUniqueViolation } from "../utils/db-errors.js";
import { resolveProjectParam } from "../utils/project-resolver.js";
import "../../types.js";
import { z } from "zod";
import { featureBranchReadiness, inspectRepository } from "../../services/feature-branch.service.js";
import { githubSlug, runPublishCommand } from "../../services/pipeline-pr.service.js";
import { cloneGitHubRepository, CloneError } from "../../services/repository-clone.service.js";
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
  // Connect an existing local checkout without replacing an origin or credentials.
  app.post("/api/projects/:id/repository-origin", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (!request.isAdmin) return reply.code(403).send({ error: "forbidden", message: "Admin only" });
    const projectId = await resolveProjectParam(app, request.params.id, reply);
    if (!projectId) return reply;
    const project = await app.projectService.getById(projectId);
    if (!project) return reply.code(404).send({ error: "not_found" });
    const parsed = z.object({ url: z.string().trim().max(500).regex(/^https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+(?:\.git)?$/, "Enter a GitHub HTTPS repository URL without credentials or query parameters.") }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", message: "Enter a GitHub HTTPS repository URL without credentials or query parameters." });
    const url = parsed.data.url;
    if (project.repoUrl) return reply.code(409).send({ error: "origin_configured", message: "This project already has a configured repository. Existing destinations cannot be replaced here." });
    let addedOrigin = false;
    try {
      const repository = await inspectRepository(project.homeDir);
      if (repository.originAvailable) return reply.code(409).send({ error: "origin_exists", message: "This checkout already has an origin. Inspect it before changing any destination." });
      // Reject an existing origin even if its URL is unsafe and hidden by inspection.
      await runPublishCommand("git", ["remote", "add", "origin", url], project.homeDir);
      addedOrigin = true;
      const current = await inspectRepository(project.homeDir);
      const pushUrls = (await runPublishCommand("git", ["remote", "get-url", "--push", "--all", "origin"], project.homeDir)).trim().split("\n").filter(Boolean);
      if (current.origin !== url || pushUrls.length !== 1 || pushUrls[0] !== url) throw new Error("Could not verify the new origin and push destination.");
      await app.projectService.update(projectId, { repoUrl: url });
      return reply.code(201).send({ origin: url, configuredRepository: url, originMatchesProject: true, pushMatchesProject: true });
    } catch (error) {
      if (addedOrigin) {
        try {
          const current = (await runPublishCommand("git", ["remote", "get-url", "origin"], project.homeDir)).trim();
          const pushUrls = (await runPublishCommand("git", ["remote", "get-url", "--push", "--all", "origin"], project.homeDir)).trim().split("\n").filter(Boolean);
          if (current === url && pushUrls.length === 1 && pushUrls[0] === url) {
            // `git remote remove` also deletes refs/remotes/origin/*, which may
            // predate this request even when no origin remote was configured.
            await runPublishCommand("git", ["config", "--local", "--remove-section", "remote.origin"], project.homeDir);
          }
        } catch (rollbackError) { request.log.error({ err: rollbackError }, "could not undo newly added origin"); }
      }
      request.log.error({ err: error }, "repository origin setup failed");
      return reply.code(422).send({ error: "origin_setup_failed", message: "Could not connect this checkout. Inspect its origin and project settings before retrying." });
    }
  });
  app.get("/api/projects/:id/repository-origin", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const projectId = await resolveProjectParam(app, request.params.id, reply);
    if (!projectId) return reply;
    if (!requireProjectScope(request, reply, projectId)) return reply;
    const project = await app.projectService.getById(projectId);
    if (!project) return reply.code(404).send({ error: "not_found" });
    try {
      const repository = await inspectRepository(project.homeDir);
      const configured = project.repoUrl && githubSlug(project.repoUrl);
      const originMatchesProject = !!configured && !!repository.origin && githubSlug(repository.origin) === configured;
      let pushMatchesProject = false;
      if (originMatchesProject) {
        const pushUrls = (await runPublishCommand("git", ["remote", "get-url", "--push", "--all", "origin"], project.homeDir))
          .trim().split("\n").filter(Boolean);
        pushMatchesProject = !!pushUrls.length && pushUrls.every(url => githubSlug(url) === configured);
      }
      return { ...repository, configuredRepository: configured ? `https://github.com/${configured}` : null,
        originMatchesProject, pushMatchesProject };
    }
    catch { return reply.code(422).send({ error: "repository_unavailable", message: "Could not inspect the repository origin." }); }
  });
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
  // Clone only public GitHub HTTPS repositories into a fresh directory. Project creation remains explicit.
  app.post("/api/projects/repository-clone", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.isAdmin) return reply.code(403).send({ error: "forbidden", message: "Admin only" });
    const parsed = z.object({ url: z.string().min(1).max(500), parentDir: z.string().min(1).max(4096) }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", message: "Enter a GitHub HTTPS URL and an existing local parent directory." });
    try { return reply.code(201).send(await cloneGitHubRepository(parsed.data.url, parsed.data.parentDir)); }
    catch (error) {
      if (error instanceof CloneError) return reply.code(error.status).send({ error: "clone_failed", message: error.message });
      request.log.error({ err: error }, "repository clone failed");
      return reply.code(422).send({ error: "clone_failed", message: "Could not clone the repository. Check the parent directory and network connection." });
    }
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
