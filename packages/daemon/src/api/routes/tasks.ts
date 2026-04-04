// packages/daemon/src/api/routes/tasks.ts
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { CreateTaskSchema, UpdateTaskSchema, CompletePipelineStepSchema, ConvertTaskSchema, TaskFilterSchema } from "@orch/shared";
import { TaskService } from "../../services/task.service.js";
import { CommentService } from "../../services/comment.service.js";
import type { TaskColumn } from "../../services/task-transitions.js";
import { requirePermission } from "../middleware/permissions.js";

export async function taskRoutes(app: FastifyInstance) {
  const taskService = new TaskService(app.db);
  const commentService = new CommentService(app.db);

  // POST /api/tasks — Create task
  app.post("/api/tasks", {
    preHandler: requirePermission("create_task"),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = CreateTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "validation_error",
        details: parsed.error.issues,
      });
    }

    const task = await taskService.create(parsed.data);

    // Dispatch agent if task created with assignee
    if (task.assignee) {
      await app.heartbeatService.enqueueWakeup(task.assignee, task.projectId, {
        source: "assignment",
        taskId: task.id,
        reason: "task_created_with_assignee",
      });
    }

    return reply.code(201).send(task);
  });

  // GET /api/tasks — List tasks
  app.get("/api/tasks", async (request: FastifyRequest) => {
    const parsed = TaskFilterSchema.safeParse(request.query);
    const filter = parsed.success ? parsed.data : {};
    return taskService.list(filter);
  });

  // GET /api/tasks/:id — Get task
  app.get("/api/tasks/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const task = await taskService.getById(request.params.id);
    if (!task) {
      return reply.code(404).send({ error: "not_found", message: "Task not found" });
    }
    return task;
  });

  // PATCH /api/tasks/:id — Update task (non-state fields only)
  app.patch("/api/tasks/:id", {
    preHandler: requirePermission("assign_task"),
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = UpdateTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "validation_error",
        details: parsed.error.issues,
      });
    }

    // If column is being changed, redirect to lifecycle transition
    if (parsed.data.column) {
      try {
        const task = await app.lifecycleService.transition(
          request.params.id,
          parsed.data.column as TaskColumn,
          {
            agentId: request.agent?.id,
            runId: request.runId,
          },
        );
        return task;
      } catch (err) {
        const message = (err as Error).message;
        if (message.startsWith("Invalid transition")) {
          return reply.code(400).send({ error: "invalid_transition", message });
        }
        if (message === "Task not found") {
          return reply.code(404).send({ error: "not_found", message });
        }
        throw err;
      }
    }

    try {
      const task = await taskService.update(request.params.id, parsed.data);

      // Dispatch agent if assignee was set and task is in backlog
      if (parsed.data.assignee && task.column === "backlog") {
        await app.heartbeatService.enqueueWakeup(parsed.data.assignee, task.projectId, {
          source: "assignment",
          taskId: task.id,
          reason: "task_assigned",
        });
      }

      return task;
    } catch (err) {
      if ((err as Error).message === "Task not found") {
        return reply.code(404).send({ error: "not_found", message: "Task not found" });
      }
      throw err;
    }
  });

  // POST /api/tasks/:id/transition — Explicit lifecycle transition
  app.post(
    "/api/tasks/:id/transition",
    {
      preHandler: requirePermission("move_task"),
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const body = request.body as { column?: string; agentId?: string; runId?: string };
      if (!body.column) {
        return reply.code(400).send({ error: "validation_error", message: "column is required" });
      }

      try {
        const task = await app.lifecycleService.transition(
          request.params.id,
          body.column as TaskColumn,
          {
            agentId: body.agentId ?? request.agent?.id,
            runId: body.runId ?? request.runId,
          },
        );
        return task;
      } catch (err) {
        const message = (err as Error).message;
        if (message.startsWith("Invalid transition")) {
          return reply.code(400).send({ error: "invalid_transition", message });
        }
        if (message === "Task not found") {
          return reply.code(404).send({ error: "not_found", message });
        }
        if (message.includes("agentId and runId are required")) {
          return reply.code(400).send({ error: "validation_error", message });
        }
        throw err;
      }
    },
  );

  // POST /api/tasks/:id/complete — Signal task or phase completion
  app.post("/api/tasks/:id/complete", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const task = await taskService.getById(request.params.id);
    if (!task) {
      return reply.code(404).send({ error: "not_found", message: "Task not found" });
    }

    // Pipeline step completion
    if (task.pipelineId && task.pipelineStepId) {
      const parsed = CompletePipelineStepSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation_error",
          message: "Pipeline step completion requires 'output' field",
          details: parsed.error.issues,
        });
      }

      const pipelineData = await app.pipelineService.findByTaskId(task.id);
      if (!pipelineData) {
        return reply.code(500).send({ error: "internal", message: "Pipeline data not found for task" });
      }

      const outputFilePath = pipelineData.step.outputFilePath
        ?? `.orch8/pipelines/${pipelineData.pipeline.id}/${pipelineData.step.label}.md`;

      const result = await app.pipelineService.completeStep(
        pipelineData.pipeline.id,
        pipelineData.step.id,
        parsed.data.output,
        outputFilePath,
      );

      // Post step output as a system comment on the task
      try {
        await commentService.create({
          taskId: task.id,
          author: request.agent?.id ?? "system",
          body: parsed.data.output,
          type: "system",
        });
      } catch {
        // Best-effort — don't block completion if comment fails
      }

      // Transition task to done
      try {
        await app.lifecycleService.transition(task.id, "done");
      } catch {
        // Best-effort: task may already be in done state
      }

      // Wake next step's agent if there is one
      if (result.nextStep?.agentId && result.nextTask) {
        await app.heartbeatService.enqueueWakeup(
          result.nextStep.agentId,
          task.projectId,
          {
            source: "automation",
            taskId: result.nextTask.id,
            reason: "pipeline_step_ready",
          },
        );
      }

      return result;
    }

    // Quick task completion — use lifecycle service
    try {
      const updated = await app.lifecycleService.transition(task.id, "done");
      return updated;
    } catch (err) {
      const message = (err as Error).message;
      if (message.startsWith("Invalid transition")) {
        return reply.code(400).send({ error: "invalid_transition", message });
      }
      throw err;
    }
  });

  // POST /api/tasks/:id/dependencies — Add dependency
  app.post("/api/tasks/:id/dependencies", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const body = request.body as { dependsOnId?: string };
    if (!body.dependsOnId) {
      return reply.code(400).send({ error: "validation_error", message: "dependsOnId is required" });
    }

    try {
      await taskService.addDependency(request.params.id, body.dependsOnId);
      return reply.code(201).send({ ok: true });
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("cycle")) {
        return reply.code(409).send({ error: "conflict", message });
      }
      throw err;
    }
  });

  // DELETE /api/tasks/:id/dependencies/:depId — Remove dependency
  app.delete("/api/tasks/:id/dependencies/:depId", async (request: FastifyRequest<{ Params: { id: string; depId: string } }>) => {
    await taskService.removeDependency(request.params.id, request.params.depId);
    return { ok: true };
  });

  // POST /api/tasks/:id/convert — Convert brainstorm to work task
  app.post("/api/tasks/:id/convert", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = ConvertTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "validation_error",
        details: parsed.error.issues,
      });
    }

    try {
      const task = await taskService.convertBrainstorm(request.params.id, parsed.data.taskType);
      return task;
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("Only brainstorm")) {
        return reply.code(400).send({ error: "bad_request", message });
      }
      throw err;
    }
  });

  // POST /api/tasks/:id/checkout — Atomic task claim (agent-driven)
  app.post(
    "/api/tasks/:id/checkout",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const agentId = request.agent?.id;
      const runId = request.runId;

      if (!agentId) {
        return reply.code(401).send({
          error: "unauthorized",
          message: "Agent authentication required for checkout",
        });
      }

      try {
        const task = await app.lifecycleService.checkout(
          request.params.id,
          agentId,
          runId ?? "unknown",
        );
        return task;
      } catch (err) {
        const message = (err as Error).message;
        if (message.startsWith("Checkout conflict")) {
          return reply.code(409).send({ error: "conflict", message });
        }
        if (message === "Task not found") {
          return reply.code(404).send({ error: "not_found", message });
        }
        if (message.startsWith("Cannot checkout")) {
          return reply.code(400).send({ error: "bad_request", message });
        }
        throw err;
      }
    },
  );

  // POST /api/tasks/:id/release — Release execution lock without completing
  app.post(
    "/api/tasks/:id/release",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const agentId = request.agent?.id;

      if (!agentId) {
        return reply.code(401).send({
          error: "unauthorized",
          message: "Agent authentication required for release",
        });
      }

      try {
        const task = await app.lifecycleService.release(
          request.params.id,
          agentId,
        );
        return task;
      } catch (err) {
        const message = (err as Error).message;
        if (message === "Task not found") {
          return reply.code(404).send({ error: "not_found", message });
        }
        if (message.includes("does not hold")) {
          return reply.code(403).send({ error: "forbidden", message });
        }
        throw err;
      }
    },
  );
}
