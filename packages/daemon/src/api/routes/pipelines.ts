import { PipelineConflict } from "../../services/pipeline.service.js";
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
import { realpath } from "node:fs/promises";

const runGit = promisify(execFile);
const DIFF_MAX_BYTES = 1024 * 1024;

async function repositoryDiff(homeDir: string): Promise<{ available: boolean; diff: string; reason?: string }> {
  // Ignore inherited Git environment overrides and global configuration. No hooks,
  // pagers, external diff programs or textconv commands should run for this read.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = "/dev/null";
  const git = (args: string[]) => runGit("git", ["-c", "core.fsmonitor=false", ...args], {
    cwd: homeDir, env, timeout: 10_000, maxBuffer: DIFF_MAX_BYTES, encoding: "utf8",
  });
  try {
    const root = await realpath(homeDir);
    const { stdout: topLevel } = await git(["rev-parse", "--show-toplevel"]);
    // A subdirectory within some other repository is not itself this project's repo.
    if (await realpath(topLevel.trim()) !== root) {
      return { available: false, diff: "", reason: "Project directory is not a Git repository root." };
    }
    const { stdout } = await git(["diff", "--no-ext-diff", "--no-textconv", "--no-color", "HEAD", "--"]);
    return { available: true, diff: stdout };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      return { available: false, diff: "", reason: "Diff exceeds the 1 MiB viewing limit." };
    }
    return { available: false, diff: "", reason: "Repository diff is unavailable (not a Git repository or no HEAD commit)." };
  }
}

export async function pipelineRoutes(app: FastifyInstance) {
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

  // The diff is a live snapshot of tracked changes against HEAD, not step output.
  app.get("/api/pipelines/:id/diff", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const pipeline = await app.pipelineService.getById(request.params.id);
    if (!pipeline) return reply.code(404).send({ error: "not_found", message: "Pipeline not found" });
    if (!requireProjectScope(request, reply, pipeline.projectId)) return reply;
    const project = await app.projectService.getById(pipeline.projectId);
    if (!project) return reply.code(404).send({ error: "not_found", message: "Project not found" });
    return repositoryDiff(project.homeDir);
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
