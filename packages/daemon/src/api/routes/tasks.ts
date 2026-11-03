import { PipelineConflict } from "../../services/pipeline.service.js";
// packages/daemon/src/api/routes/tasks.ts
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { CreateTaskSchema, TaskColumnSchema, UpdateTaskSchema, CompletePipelineStepSchema, ConvertTaskSchema, TaskFilterSchema } from "@orch/shared";
import { eq } from "drizzle-orm";
import { agents } from "@orch/shared/db";
import { requireProjectScope } from "../utils/project-scope.js";
import { TaskService } from "../../services/task.service.js";
import { CommentService } from "../../services/comment.service.js";
import type { TaskColumn } from "../../services/task-transitions.js";
import { requirePermission } from "../middleware/permissions.js";
import { resolveProjectParam, resolveProjectValue } from "../utils/project-resolver.js";

export async function taskRoutes(app: FastifyInstance) {
  const taskService = new TaskService(app.db);
  const commentService = new CommentService(app.db);

  // Services remain trusted entrypoints; authorize persisted ownership at the API.
  async function scopedTask(request: FastifyRequest, reply: FastifyReply, id: string) {
    const task = await taskService.getById(id);
    if (!task) {
      reply.code(404).send({ error: "not_found", message: "Task not found" });
      return null;
    }
    return requireProjectScope(request, reply, task.projectId) ? task : null;
  }

  async function scopedAssignee(request: FastifyRequest, reply: FastifyReply, id?: string | null) {
    // Preserve admin association semantics and assignment removal.
    if (request.isAdmin || !id) return true;
    const [agent] = await app.db.select().from(agents).where(eq(agents.id, id));
    if (!agent) {
      reply.code(404).send({ error: "not_found", message: "Agent not found" });
      return false;
    }
    return requireProjectScope(request, reply, agent.projectId);
  }

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

    const projectId = await resolveProjectParam(app, parsed.data.projectId, reply);
    if (!projectId) return reply;
    if (!requireProjectScope(request, reply, projectId)) return reply;
    if (!await scopedAssignee(request, reply, parsed.data.assignee)) return reply;
    if (!request.isAdmin) {
      for (const id of parsed.data.dependsOn ?? []) {
        if (!await scopedTask(request, reply, id)) return reply;
      }
    }
    const { dependsOn, ...taskData } = { ...parsed.data, projectId };

    // Insert the task row and attach its initial dependencies in a single
    // transaction. A cycle detected on dep #2 previously left the task
    // persisted with only dep #1 wired; the atomic version rolls back
    // the whole create on any failure.
    let finalTask;
    try {
      finalTask = dependsOn && dependsOn.length > 0
        ? await taskService.createWithDependencies(taskData, dependsOn)
        : await taskService.create(taskData);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("cycle") || message.includes("cannot depend on itself")) {
        return reply.code(409).send({ error: "conflict", message });
      }
      throw err;
    }

    // Dispatch agent only if task is in backlog (not blocked by dependencies)
    if (finalTask.assignee && finalTask.column === "backlog") {
      await app.heartbeatService.enqueueWakeup(finalTask.assignee, finalTask.projectId, {
        source: "assignment",
        taskId: finalTask.id,
        reason: "task_created_with_assignee",
      });
    }

    return reply.code(201).send(finalTask);
  });

  // GET /api/tasks — List tasks
  app.get("/api/tasks", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = TaskFilterSchema.safeParse(request.query);
    const filter = parsed.success ? parsed.data : {};
    if (!request.isAdmin) {
      if (!requireProjectScope(request, reply, request.agent?.projectId ?? "")) return reply;
      // Check an explicit project even when another filter field fails parsing.
      const explicitProject = (request.query as { projectId?: unknown }).projectId;
      if (typeof explicitProject === "string" && explicitProject) {
        const projectId = await resolveProjectParam(app, explicitProject, reply);
        if (!projectId || !requireProjectScope(request, reply, projectId)) return reply;
      }
      filter.projectId = request.agent!.projectId;
    } else if (filter.projectId) {
      filter.projectId = await resolveProjectValue(app, filter.projectId);
    }
    return taskService.list(filter);
  });

  // GET /api/tasks/:id — Get task
  app.get("/api/tasks/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const task = await scopedTask(request, reply, request.params.id);
    if (!task) return reply;
    return task;
  });

  // DELETE /api/tasks/:id — Delete task
  // Requires `create_task` permission (no dedicated delete permission exists yet;
  // create_task is the closest analogue — agents that can create can also delete).
  // Returns 409 if the task is currently held by an active execution lock.
  app.delete<{ Params: { id: string } }>(
    "/api/tasks/:id",
    {
      preHandler: requirePermission("create_task"),
    },
    async (request, reply: FastifyReply) => {
      const task = await scopedTask(request, reply, request.params.id);
      if (!task) return reply;

      // Refuse to delete a task that's actively executing. The executing
      // agent still owns the worktree and run; yanking the task out from
      // under it leaves orphan state. The client should release or wait.
      if (task.executionAgentId || task.executionRunId) {
        return reply.code(409).send({
          error: "conflict",
          message: "Cannot delete a task that is actively executing; release the lock first",
        });
      }

      // Pipeline-linked tasks drive a larger pipeline; deleting one in
      // isolation would leave the pipeline pointing at a ghost step.
      if (task.pipelineId) {
        return reply.code(409).send({
          error: "conflict",
          message: "Cannot delete a task that is part of a pipeline",
        });
      }

      await taskService.delete(request.params.id);
      return reply.code(204).send();
    },
  );

  // PATCH /api/tasks/:id — Update task (non-state fields only)
  app.patch<{ Params: { id: string } }>("/api/tasks/:id", {
    preHandler: requirePermission("assign_task"),
  }, async (request, reply: FastifyReply) => {
    const parsed = UpdateTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "validation_error",
        details: parsed.error.issues,
      });
    }

    if (!await scopedTask(request, reply, request.params.id)) return reply;
    if (!await scopedAssignee(request, reply, parsed.data.assignee)) return reply;

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
        if (err instanceof PipelineConflict) throw err;
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
  app.post<{ Params: { id: string } }>(
    "/api/tasks/:id/transition",
    {
      preHandler: requirePermission("move_task"),
    },
    async (request, reply: FastifyReply) => {
      if (!await scopedTask(request, reply, request.params.id)) return reply;
      const body = request.body as { column?: string; agentId?: string; runId?: string } | undefined;
      if (!body?.column) {
        return reply.code(400).send({ error: "validation_error", message: "column is required" });
      }
      if (!TaskColumnSchema.safeParse(body.column).success) {
        return reply.code(400).send({ error: "validation_error", message: "Invalid task column" });
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
        if (err instanceof PipelineConflict) throw err;
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
    const task = await scopedTask(request, reply, request.params.id);
    if (!task) return reply;

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

      const result = await app.pipelineService.completeStep(
        task.pipelineId, task.pipelineStepId, task.id, parsed.data.output,
      );
      await taskService.unblockResolved(task.projectId);

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
    if (!await scopedTask(request, reply, request.params.id)) return reply;
    const body = request.body as { dependsOnId?: string };
    if (!body.dependsOnId) {
      return reply.code(400).send({ error: "validation_error", message: "dependsOnId is required" });
    }

    try {
      if (!request.isAdmin && !await scopedTask(request, reply, body.dependsOnId)) return reply;
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
  app.delete("/api/tasks/:id/dependencies/:depId", async (request: FastifyRequest<{ Params: { id: string; depId: string } }>, reply: FastifyReply) => {
    if (!await scopedTask(request, reply, request.params.id)) return reply;
    if (!request.isAdmin && !await scopedTask(request, reply, request.params.depId)) return reply;
    await taskService.removeDependency(request.params.id, request.params.depId);
    return { ok: true };
  });

  // POST /api/tasks/:id/convert — Convert brainstorm to work task
  app.post("/api/tasks/:id/convert", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (!await scopedTask(request, reply, request.params.id)) return reply;
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

      if (!await scopedTask(request, reply, request.params.id)) return reply;
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

      if (!await scopedTask(request, reply, request.params.id)) return reply;
      try {
        const task = await app.lifecycleService.release(
          request.params.id,
          agentId,
          request.runId,
        );
        return task;
      } catch (err) {
        if (err instanceof PipelineConflict) throw err;
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
