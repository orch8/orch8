import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  CreatePipelineSchema,
  PipelineFilterSchema,
  UpdatePipelineStepSchema,
  RejectPipelineStepSchema,
} from "@orch/shared";
import { resolveProjectParam, resolveProjectValue } from "../utils/project-resolver.js";

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

  // POST /api/pipelines/:id/cancel — Cancel pipeline
  app.post("/api/pipelines/:id/cancel", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const pipeline = await app.pipelineService.cancel(request.params.id);
      return pipeline;
    } catch (err) {
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
        const message = (err as Error).message;
        if (message.includes("not found")) {
          return reply.code(404).send({ error: "not_found", message });
        }
        if (message.includes("lower order")) {
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
        const message = (err as Error).message;
        if (message.includes("not found")) {
          return reply.code(404).send({ error: "not_found", message });
        }
        if (message.includes("not awaiting verification")) {
          return reply.code(400).send({ error: "bad_request", message });
        }
        throw err;
      }
    },
  );
}
