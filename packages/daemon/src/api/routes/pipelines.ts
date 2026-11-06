import { z } from "zod";
import { PipelineConflict } from "../../services/pipeline.service.js";
import { publishPipelinePr } from "../../services/pipeline-pr.service.js";
import { featureBranchReadiness, prepareFeatureBranch, returnToBaseBranch } from "../../services/feature-branch.service.js";
import { heartbeatRuns, pipelines } from "@orch/shared/db";
import { and, inArray } from "drizzle-orm";
import { readPrChecks, type PrCheck } from "../../services/pr-checks.js";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  CreatePipelineSchema,
  PipelineFilterSchema,
  UpdatePipelineStepSchema,
  RejectPipelineStepSchema,
} from "@orch/shared";
import { resolveProjectParam, resolveProjectValue } from "../utils/project-resolver.js";
import { requireProjectScope } from "../utils/project-scope.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

const runGit = promisify(execFile);
const DIFF_MAX_BYTES = 1024 * 1024;
const UNTRACKED_PREVIEW_LIMIT = 20;
const ARTIFACT_MAX_BYTES = 256 * 1024;

// Read only recorded step output within this pipeline's artifact directory.
async function stepArtifact(homeDir: string, pipelineId: string, outputFilePath: string) {
  const expectedDir = resolve(homeDir, ".orch8", "pipelines", pipelineId);
  if (isAbsolute(outputFilePath)) return null;
  const candidate = resolve(homeDir, outputFilePath);
  const within = relative(expectedDir, candidate);
  if (!within || within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within)) return null;
  try {
    const projectRoot = await realpath(homeDir);
    const root = await realpath(expectedDir);
    // A symlink in .orch8/pipelines/<id> must not turn another project file
    // into the recorded pipeline output, even when it remains inside the project.
    if (root !== resolve(projectRoot, ".orch8", "pipelines", pipelineId)) return null;
    const rootWithin = relative(projectRoot, root);
    if (!rootWithin || rootWithin === ".." || rootWithin.startsWith(`..${sep}`) || isAbsolute(rootWithin)) return null;
    // Open the candidate itself, then check the open descriptor rather than a
    // pathname that a workspace process could swap after validation.
    const handle = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const file = await realpath(`/proc/self/fd/${handle.fd}`);
      const actual = relative(root, file);
      if (!actual || actual === ".." || actual.startsWith(`..${sep}`) || isAbsolute(actual)) return null;
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > ARTIFACT_MAX_BYTES) return null;
      const buffer = Buffer.alloc(stat.size);
      const { bytesRead } = await handle.read(buffer, 0, stat.size, 0);
      if (bytesRead !== stat.size) return null;
      return buffer.toString("utf8");
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

async function repositoryDiff(homeDir: string, baseBranch: string): Promise<{
  available: boolean; diff: string; reason?: string; baseBranch?: string;
  committedDiff?: string; workingDiff?: string; untrackedFiles?: string[]; untrackedMore?: boolean;
  branch?: string; pullRequest?: { number: number; url: string; title: string; state: string; checks: PrCheck[] } | null;
  prLookup?: "found" | "none" | "unavailable" | "not_applicable";
}> {
  // Ignore inherited Git environment overrides and global configuration. No hooks,
  // pagers, external diff programs or textconv commands should run for this read.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = "/dev/null";
  env.GIT_NO_LAZY_FETCH = "1";
  const git = (args: string[]) => runGit("git", ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", ...args], {
    cwd: homeDir, env, timeout: 10_000, maxBuffer: DIFF_MAX_BYTES, encoding: "utf8",
  });
  try {
    const root = await realpath(homeDir);
    const { stdout: topLevel } = await git(["rev-parse", "--show-toplevel"]);
    // A subdirectory within some other repository is not itself this project's repo.
    if (await realpath(topLevel.trim()) !== root) {
      return { available: false, diff: "", reason: "Project directory is not a Git repository root." };
    }
    if (!baseBranch || baseBranch.length > 200 || !/^[a-zA-Z0-9_./-]+$/.test(baseBranch) || baseBranch.startsWith("-") || baseBranch.includes("..") || baseBranch.includes("//")) {
      return { available: false, diff: "", reason: "Configured default branch is invalid." };
    }
    // Prefer the fetched origin ref: the local base can lag while another
    // worktree advances the default branch. Never fetch implicitly.
    let baseRef = `refs/remotes/origin/${baseBranch}`;
    try {
      await git(["show-ref", "--verify", "--quiet", baseRef]);
    } catch {
      baseRef = `refs/heads/${baseBranch}`;
      try {
        await git(["show-ref", "--verify", "--quiet", baseRef]);
      } catch {
        return { available: false, diff: "", reason: `Configured default branch '${baseBranch}' is not available locally.` };
      }
    }
    let mergeBase: string;
    try {
      mergeBase = (await git(["merge-base", "HEAD", baseRef])).stdout.trim();
    } catch {
      return { available: false, diff: "", reason: "No common ancestor with the configured default branch." };
    }
    const diffArgs = ["diff", "--no-ext-diff", "--no-textconv", "--no-color", "--ignore-submodules=all"];
    const committedDiff = (await git([...diffArgs, mergeBase, "HEAD", "--"])).stdout;
    const workingDiff = (await git([...diffArgs, "HEAD", "--"])).stdout;
    const diff = committedDiff + workingDiff;
    if (Buffer.byteLength(diff) > DIFF_MAX_BYTES) {
      return { available: false, diff: "", reason: "Diff exceeds the 1 MiB viewing limit." };
    }
    const untracked = (await git(["ls-files", "--others", "--exclude-standard", "-z"])).stdout;
    const paths = untracked ? untracked.split("\0").filter(Boolean) : [];
    const branch = (await git(["symbolic-ref", "--quiet", "--short", "HEAD"]).catch(() => ({ stdout: "" }))).stdout.trim();
    let pullRequest: { number: number; url: string; title: string; state: string; isDraft?: boolean; checks: PrCheck[] } | null = null;
    let prLookup: "found" | "none" | "unavailable" | "not_applicable" = "not_applicable";
    if (branch && branch !== baseBranch) {
      try {
        const origin = (await git(["remote", "get-url", "origin"])).stdout.trim();
        const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(origin);
        if (match) {
          const head = (await git(["rev-parse", "HEAD"])).stdout.trim();
          const repo = `${match[1]}/${match[2]}`;
          const { stdout } = await runGit("gh", ["pr", "list", "--repo", repo, "--head", branch, "--base", baseBranch,
            "--state", "all", "--json", "number,url,title,state,isDraft,headRefOid,statusCheckRollup", "--limit", "20"],
          { cwd: homeDir, env, timeout: 10_000, maxBuffer: 1024 * 1024, encoding: "utf8" });
          const items: unknown = JSON.parse(stdout);
          if (!Array.isArray(items)) throw new Error("Invalid GitHub response");
          const found = items.find(item => item && typeof item === "object" && item.headRefOid === head &&
            typeof item.number === "number" && typeof item.title === "string" &&
            typeof item.url === "string" && item.url.startsWith(`https://github.com/${repo}/pull/`) &&
            ["OPEN", "CLOSED", "MERGED"].includes(item.state));
          if (found) {
            pullRequest = { number: found.number, url: found.url, title: found.title, state: found.state,
              ...(typeof found.isDraft === "boolean" ? { isDraft: found.isDraft } : {}), checks: readPrChecks(found.statusCheckRollup) };
            prLookup = "found";
          } else prLookup = items.length < 20 ? "none" : "unavailable";
        } else prLookup = "unavailable";
      } catch {
        prLookup = "unavailable";
      }
    }
    return {
      available: true, diff, baseBranch, committedDiff, workingDiff,
      untrackedFiles: paths.slice(0, UNTRACKED_PREVIEW_LIMIT), untrackedMore: paths.length > UNTRACKED_PREVIEW_LIMIT,
      branch: branch || undefined, pullRequest, prLookup,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      return { available: false, diff: "", reason: "Diff exceeds the 1 MiB viewing limit." };
    }
    return { available: false, diff: "", reason: "Repository diff is unavailable (not a Git repository or no HEAD commit)." };
  }
}

export async function pipelineRoutes(app: FastifyInstance) {
  // Repository-wide live inspection; no pipeline, agent run, or publication required.
  app.get("/api/projects/:projectId/repository-changes", async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    if (!requireProjectScope(request, reply, request.params.projectId)) return reply;
    const project = await app.projectService.getById(request.params.projectId);
    if (!project) return reply.code(404).send({ error: "not_found", message: "Project not found" });
    return repositoryDiff(project.homeDir, project.defaultBranch);
  });
  const preparing = new Set<string>();
  const publishing = new Set<string>();
  app.get("/api/projects/:projectId/feature-branch", async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    if (!requireProjectScope(request, reply, request.params.projectId)) return reply;
    const project = await app.projectService.getById(request.params.projectId);
    if (!project) return reply.code(404).send({ error: "not_found", message: "Project not found" });
    return featureBranchReadiness(project.homeDir, project.defaultBranch);
  });
  app.post("/api/projects/:projectId/feature-branch", async (request: FastifyRequest<{ Params: { projectId: string }; Body: { name?: unknown } }>, reply: FastifyReply) => {
    if (!request.isAdmin) return reply.code(403).send({ error: "forbidden", message: "Admin only" });
    if (!requireProjectScope(request, reply, request.params.projectId)) return reply;
    const project = await app.projectService.getById(request.params.projectId);
    if (!project) return reply.code(404).send({ error: "not_found", message: "Project not found" });
    if (typeof request.body?.name !== "string") return reply.code(400).send({ error: "validation_error", message: "Enter a feature branch name." });
    const key = await realpath(project.homeDir).catch(() => project.homeDir);
    if (preparing.has(key) || publishing.has(key)) return reply.code(409).send({ error: "conflict", message: "A repository operation is already running." });
    preparing.add(key);
    try { return reply.code(201).send(await prepareFeatureBranch(project.homeDir, project.defaultBranch, request.body.name)); }
    catch (error) { return reply.code(409).send({ error: "conflict", message: (error as Error).message }); }
    finally { preparing.delete(key); }
  });
  // A checkout is explicit and does not commit, reset, delete, fetch or run agents.
  app.post("/api/projects/:projectId/return-to-base", async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    if (!request.isAdmin) return reply.code(403).send({ error: "forbidden", message: "Admin only" });
    if (!requireProjectScope(request, reply, request.params.projectId)) return reply;
    const project = await app.projectService.getById(request.params.projectId);
    if (!project) return reply.code(404).send({ error: "not_found", message: "Project not found" });
    const key = await realpath(project.homeDir).catch(() => project.homeDir);
    if (preparing.has(key) || publishing.has(key)) return reply.code(409).send({ error: "conflict", message: "A repository operation is already running." });
    preparing.add(key);
    try {
      // Other project records may point at this same checkout. Check their writers too.
      const candidates = await app.projectService.list();
      const shared = (await Promise.all(candidates.map(async candidate => ({
        id: candidate.id, root: await realpath(candidate.homeDir).catch(() => candidate.homeDir),
      })))).filter(candidate => candidate.root === key).map(candidate => candidate.id);
      const active = await app.db.select({ id: pipelines.id }).from(pipelines).where(and(
        inArray(pipelines.projectId, shared), inArray(pipelines.status, ["pending", "running"]),
      )).limit(1);
      if (active.length) return reply.code(409).send({ error: "conflict", message: "An active pipeline must finish or be cancelled before switching branches." });
      const runs = await app.db.select({ id: heartbeatRuns.id }).from(heartbeatRuns).where(and(
        inArray(heartbeatRuns.projectId, shared), inArray(heartbeatRuns.status, ["queued", "running"]),
      )).limit(1);
      if (runs.length) return reply.code(409).send({ error: "conflict", message: "An agent run is queued or running for this project." });
      return await returnToBaseBranch(project.homeDir, project.defaultBranch);
    } catch (error) {
      return reply.code(409).send({ error: "conflict", message: (error as Error).message });
    } finally { preparing.delete(key); }
  });
  // Explicit admin action only. No implicit commit, checkout, or publication.
  app.post("/api/pipelines/:id/pull-request", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (!request.isAdmin) return reply.code(403).send({ error: "forbidden", message: "Admin only" });
    const result = await app.pipelineService.getWithSteps(request.params.id);
    if (!result) return reply.code(404).send({ error: "not_found", message: "Pipeline not found" });
    if (!requireProjectScope(request, reply, result.pipeline.projectId)) return reply;
    const { pipeline, steps } = result;
    if (pipeline.status !== "completed" || steps.length < 2 || steps.some(step => step.status !== "completed")) {
      return reply.code(409).send({ error: "conflict", message: "Complete every pipeline step and approval before publishing." });
    }
    const implement = steps.find(step => step.label.toLowerCase() === "implement");
    const review = steps.find(step => ["review", "independent review"].includes(step.label.toLowerCase()));
    if (!implement?.agentId || !review?.agentId || !review.requiresVerification || implement.agentId === review.agentId ||
        !review.outputSummary?.trim() || review.outputSummary.startsWith("[REJECTED]") ||
        review.order <= implement.order || review.order !== steps.length) {
      return reply.code(409).send({ error: "conflict", message: "A completed independent review after implementation is required." });
    }
    const project = await app.projectService.getById(pipeline.projectId);
    if (!project) return reply.code(404).send({ error: "not_found", message: "Project not found" });
    const key = await realpath(project.homeDir).catch(() => project.homeDir);
    if (publishing.has(key) || preparing.has(key)) return reply.code(409).send({ error: "conflict", message: "A repository operation is already running." });
    publishing.add(key);
    try {
      const published = await publishPipelinePr(project, pipeline.name, await app.pipelineService.getPublicationOutputPaths(pipeline.id));
      return reply.code(201).send(published);
    } catch (error) {
      // Expected preflight failures are actionable; never expose raw git/gh stderr or credentials.
      const message = (error as Error).message;
      const safe = /^(Configure a GitHub|Configured default branch|Project directory must|Check out a feature|Commit or remove|Git origin|No committed branch|PR lookup incomplete|A PR already exists|The repository changed)/.test(message);
      return reply.code(safe ? 409 : 502).send({ error: safe ? "conflict" : "publication_failed",
        message: safe ? message : "PR publication or verification failed. Inspect GitHub and the branch before retrying; no merge was attempted." });
    } finally {
      publishing.delete(key);
    }
  });
  // POST /api/pipelines — Create pipeline
  app.post("/api/pipelines", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = CreatePipelineSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
    }
    try {
      const projectId = await resolveProjectParam(app, parsed.data.projectId, reply);
      if (!projectId) return reply;
      const input = { ...parsed.data, projectId };
      const result = await app.pipelineService.create(input);

      // Wake first step's agent if assigned
      const firstStep = result.steps[0];
      if (firstStep?.agentId && firstStep.taskId) {
        await app.heartbeatService.enqueueWakeup(firstStep.agentId, projectId, {
          source: "automation",
          taskId: firstStep.taskId,
          reason: "pipeline_step_ready",
        });
      }

      return reply.code(201).send(result);
    } catch (err) {
      if (err instanceof PipelineConflict) throw err;
      const message = (err as Error).message;
      if (message.includes("template not found")) {
        return reply.code(404).send({ error: "not_found", message });
      }
      if (message.includes("Either steps or templateId")) {
        return reply.code(400).send({ error: "validation_error", message });
      }
      throw err;
    }
  });

  // GET /api/pipelines — List pipelines
  app.get("/api/pipelines", async (request: FastifyRequest) => {
    const parsed = PipelineFilterSchema.safeParse(request.query);
    const filter = parsed.success ? parsed.data : {};
    if (filter.projectId) {
      filter.projectId = await resolveProjectValue(app, filter.projectId);
    }
    return app.pipelineService.list(filter);
  });

  // GET /api/pipelines/:id — Get pipeline with steps
  app.get("/api/pipelines/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const result = await app.pipelineService.getWithSteps(request.params.id);
    if (!result) return reply.code(404).send({ error: "not_found", message: "Pipeline not found" });
    return result;
  });

  // Live branch and worktree snapshot, not a per-step artifact.
  app.get("/api/pipelines/:id/diff", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const pipeline = await app.pipelineService.getById(request.params.id);
    if (!pipeline) return reply.code(404).send({ error: "not_found", message: "Pipeline not found" });
    if (!requireProjectScope(request, reply, pipeline.projectId)) return reply;
    const project = await app.projectService.getById(pipeline.projectId);
    if (!project) return reply.code(404).send({ error: "not_found", message: "Project not found" });
    return { ...await repositoryDiff(project.homeDir, project.defaultBranch),
      publicationOutputPaths: await app.pipelineService.getPublicationOutputPaths(pipeline.id) };
  });

  // Prior plans remain inspectable after a revision replaces the active step's task.
  app.get("/api/pipelines/:id/plan-attempts", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const pipeline = await app.pipelineService.getById(request.params.id);
    if (!pipeline) return reply.code(404).send({ error: "not_found", message: "Pipeline not found" });
    if (!requireProjectScope(request, reply, pipeline.projectId)) return reply;
    const project = await app.projectService.getById(pipeline.projectId);
    if (!project) return reply.code(404).send({ error: "not_found", message: "Project not found" });
    const attempts = await app.pipelineService.getPlanAttempts(pipeline.id);
    return Promise.all(attempts.map(async attempt => ({ ...attempt,
      content: await stepArtifact(project.homeDir, pipeline.id, attempt.path),
    })));
  });

  // Read the recorded plan/review file; the request never supplies a filesystem path.
  app.get("/api/pipelines/:id/steps/:stepId/output", async (request: FastifyRequest<{ Params: { id: string; stepId: string } }>, reply: FastifyReply) => {
    const result = await app.pipelineService.getWithSteps(request.params.id);
    if (!result) return reply.code(404).send({ error: "not_found", message: "Pipeline not found" });
    if (!requireProjectScope(request, reply, result.pipeline.projectId)) return reply;
    const step = result.steps.find(s => s.id === request.params.stepId);
    if (!step || !step.outputFilePath || !["completed", "awaiting_verification"].includes(step.status)) {
      return reply.code(404).send({ error: "not_found", message: "Step output not available" });
    }
    const project = await app.projectService.getById(result.pipeline.projectId);
    if (!project) return reply.code(404).send({ error: "not_found", message: "Project not found" });
    const content = await stepArtifact(project.homeDir, result.pipeline.id, step.outputFilePath);
    if (content === null) return reply.code(404).send({ error: "not_found", message: "Step output missing, invalid, or over the viewing limit" });
    return { path: step.outputFilePath, content };
  });

  // POST /api/pipelines/:id/cancel — Cancel pipeline
  app.post("/api/pipelines/:id/cancel", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const pipeline = await app.pipelineService.cancel(request.params.id);
      return pipeline;
    } catch (err) {
      if (err instanceof PipelineConflict) throw err;
      if ((err as Error).message.includes("not found")) {
        return reply.code(404).send({ error: "not_found", message: "Pipeline not found" });
      }
      throw err;
    }
  });

  // POST /api/pipelines/:id/retry — Retry failed step
  app.post("/api/pipelines/:id/retry", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const result = await app.pipelineService.retry(request.params.id);

      // Wake the retried step's agent
      if (result.nextStep?.agentId && result.nextTask) {
        await app.heartbeatService.enqueueWakeup(
          result.nextStep.agentId,
          result.pipeline.projectId,
          {
            source: "automation",
            taskId: result.nextTask.id,
            reason: "pipeline_step_retry",
          },
        );
      }

      return result;
    } catch (err) {
      if (err instanceof PipelineConflict) throw err;
      const message = (err as Error).message;
      if (message.includes("not found")) {
        return reply.code(404).send({ error: "not_found", message });
      }
      if (message.includes("No failed step")) {
        return reply.code(400).send({ error: "bad_request", message });
      }
      throw err;
    }
  });

  // PATCH /api/pipelines/:id/steps/:stepId — Update step
  app.patch(
    "/api/pipelines/:id/steps/:stepId",
    async (request: FastifyRequest<{ Params: { id: string; stepId: string } }>, reply: FastifyReply) => {
      const parsed = UpdatePipelineStepSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
      }
      try {
        const step = await app.pipelineService.updateStep(
          request.params.id,
          request.params.stepId,
          parsed.data,
        );
        return step;
      } catch (err) {
        if (err instanceof PipelineConflict) throw err;
        const message = (err as Error).message;
        if (message.includes("not found")) {
          return reply.code(404).send({ error: "not_found", message });
        }
        if (message.includes("Cannot modify completed")) {
          return reply.code(400).send({ error: "bad_request", message });
        }
        throw err;
      }
    },
  );

  // POST /api/pipelines/:id/steps/:stepId/reject — Reject step
  app.post(
    "/api/pipelines/:id/steps/:stepId/reject",
    async (request: FastifyRequest<{ Params: { id: string; stepId: string } }>, reply: FastifyReply) => {
      if (!request.isAdmin) {
        return reply.code(403).send({ error: "forbidden", message: "Admin only" });
      }
      const parsed = RejectPipelineStepSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
      }
      try {
        const result = await app.pipelineService.rejectStep(
          request.params.id,
          request.params.stepId,
          parsed.data.targetStepId,
          parsed.data.feedback,
        );

        // Wake the target step's agent
        if (result.targetStep.agentId && result.newTask) {
          await app.heartbeatService.enqueueWakeup(
            result.targetStep.agentId,
            result.pipeline.projectId,
            {
              source: "automation",
              taskId: result.newTask.id,
              reason: "pipeline_step_rejected",
            },
          );
        }

        return result;
      } catch (err) {
        if (err instanceof PipelineConflict) throw err;
        const message = (err as Error).message;
        if (message.includes("not found")) {
          return reply.code(404).send({ error: "not_found", message });
        }
        if (message.includes("lower order") || message.includes("not active") || message.includes("not current") || message.includes("cannot be rejected")) {
          return reply.code(400).send({ error: "bad_request", message });
        }
        throw err;
      }
    },
  );

  app.post("/api/pipelines/:id/steps/:stepId/request-plan-changes",
    async (request: FastifyRequest<{ Params: { id: string; stepId: string } }>, reply: FastifyReply) => {
      if (!request.isAdmin) return reply.code(403).send({ error: "forbidden", message: "Admin only" });
      const pipeline = await app.pipelineService.getById(request.params.id);
      if (!pipeline) return reply.code(404).send({ error: "not_found", message: "Pipeline not found" });
      if (!requireProjectScope(request, reply, pipeline.projectId)) return reply;
      const parsed = z.object({ feedback: z.string().trim().min(1).max(10000) }).safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
      const result = await app.pipelineService.requestPlanChanges(pipeline.id, request.params.stepId, parsed.data.feedback);
      if (result.step.agentId) await app.heartbeatService.enqueueWakeup(result.step.agentId, pipeline.projectId, {
        source: "automation", taskId: result.newTask.id, reason: "pipeline_plan_changes_requested",
      });
      return result;
    });

  // POST /api/pipelines/:id/steps/:stepId/approve — Approve a verification gate
  app.post(
    "/api/pipelines/:id/steps/:stepId/approve",
    async (request: FastifyRequest<{ Params: { id: string; stepId: string } }>, reply: FastifyReply) => {
      if (!request.isAdmin) {
        return reply.code(403).send({ error: "forbidden", message: "Admin only" });
      }
      try {
        const result = await app.pipelineService.approveStep(
          request.params.id,
          request.params.stepId,
        );

        // Wake the next step's agent if there is one
        if (result.nextStep?.agentId && result.nextTask) {
          await app.heartbeatService.enqueueWakeup(
            result.nextStep.agentId,
            result.pipeline.projectId,
            {
              source: "automation",
              taskId: result.nextTask.id,
              reason: "pipeline_step_ready",
            },
          );
        }

        return result;
      } catch (err) {
        if (err instanceof PipelineConflict) throw err;
        const message = (err as Error).message;
        if (message.includes("not found")) {
          return reply.code(404).send({ error: "not_found", message });
        }
        if (message.includes("not awaiting verification") || message.includes("not active") || message.includes("not current")) {
          return reply.code(400).send({ error: "bad_request", message });
        }
        throw err;
      }
    },
  );
}
