// packages/daemon/src/api/routes/tasks.ts
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { CreateTaskSchema, UpdateTaskSchema, CompletePhaseSchema, ConvertTaskSchema, TaskFilterSchema } from "@orch/shared";
import { TaskService } from "../../services/task.service.js";
import { ComplexPhaseService } from "../../services/complex-phase.service.js";
import type { TaskColumn } from "../../services/task-transitions.js";
import { requirePermission } from "../middleware/permissions.js";

export async function taskRoutes(app: FastifyInstance) {
  const taskService = new TaskService(app.db);
  const phaseService = new ComplexPhaseService(app.db);

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

    if (task.taskType === "complex" && task.complexPhase) {
      const parsed = CompletePhaseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation_error",
          message: "Complex task phase completion requires 'output' field",
          details: parsed.error.issues,
        });
      }

      const result = await phaseService.completePhase(task.id, parsed.data.output);

      // Wake the next phase agent if there is one
      if (result.nextPhase) {
        const nextAgent = await phaseService.getPhaseAgent(result.task, result.nextPhase);
        if (nextAgent) {
          await app.heartbeatService.enqueueWakeup(nextAgent.id, task.projectId, {
            source: "automation",
            taskId: task.id,
            reason: `phase_${result.nextPhase}_ready`,
          });
        }
      } else {
        // Final phase — use lifecycle transition for review so onReview hook fires
        try {
          await app.lifecycleService.transition(task.id, "review");
        } catch {
          // completePhase already set column to "review" directly, so this is best-effort
        }
      }

      return result;
    }

    // Quick task completion — use lifecycle service
    try {
      const updated = await app.lifecycleService.transition(task.id, "review");
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
}
