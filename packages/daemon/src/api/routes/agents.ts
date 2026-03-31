import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { CreateAgentSchema, UpdateAgentSchema, AgentFilterSchema, CloneAgentSchema } from "@orch/shared";
import "../../types.js";

export async function agentRoutes(app: FastifyInstance) {
  // POST /api/agents — Create agent (admin only)
  app.post("/api/agents", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = CreateAgentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "validation_error",
        details: parsed.error.issues,
      });
    }

    try {
      const agent = await app.agentService.create(parsed.data);
      return reply.code(201).send(agent);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("duplicate") || message.includes("unique")) {
        return reply.code(409).send({ error: "conflict", message: "Agent with this ID already exists in project" });
      }
      throw err;
    }
  });

  // GET /api/agents — List agents
  app.get("/api/agents", async (request: FastifyRequest) => {
    const parsed = AgentFilterSchema.safeParse(request.query);
    const filter = parsed.success ? parsed.data : {};
    return app.agentService.list(filter);
  });

  // GET /api/agents/:id — Get agent
  app.get("/api/agents/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    const agent = await app.agentService.getById(request.params.id, projectId);
    if (!agent) {
      return reply.code(404).send({ error: "not_found", message: "Agent not found" });
    }
    return agent;
  });

  // PATCH /api/agents/:id — Update agent
  app.patch("/api/agents/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = UpdateAgentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "validation_error",
        details: parsed.error.issues,
      });
    }

    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    try {
      const agent = await app.agentService.update(request.params.id, projectId, parsed.data);
      return agent;
    } catch (err) {
      if ((err as Error).message === "Agent not found") {
        return reply.code(404).send({ error: "not_found", message: "Agent not found" });
      }
      throw err;
    }
  });

  // POST /api/agents/:id/pause — Pause agent
  app.post("/api/agents/:id/pause", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    const body = request.body as { reason?: string } | null;
    try {
      const agent = await app.agentService.pause(request.params.id, projectId, body?.reason);
      return agent;
    } catch (err) {
      const message = (err as Error).message;
      if (message === "Agent not found") {
        return reply.code(404).send({ error: "not_found", message });
      }
      if (message.includes("already paused")) {
        return reply.code(409).send({ error: "conflict", message });
      }
      throw err;
    }
  });

  // POST /api/agents/:id/resume — Resume agent
  app.post("/api/agents/:id/resume", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    try {
      const agent = await app.agentService.resume(request.params.id, projectId);

      // Wake agent for any tasks assigned to it in backlog
      const backlogTasks = await app.taskService.list({
        projectId,
        assignee: agent.id,
        column: "backlog",
      });
      for (const task of backlogTasks) {
        await app.heartbeatService.enqueueWakeup(agent.id, projectId, {
          source: "automation",
          taskId: task.id,
          reason: "agent_resumed",
        });
      }

      return agent;
    } catch (err) {
      const message = (err as Error).message;
      if (message === "Agent not found") {
        return reply.code(404).send({ error: "not_found", message });
      }
      if (message.includes("not paused")) {
        return reply.code(409).send({ error: "conflict", message });
      }
      throw err;
    }
  });

  // POST /api/agents/:id/wake — Manual on-demand wakeup
  app.post("/api/agents/:id/wake", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    const body = request.body as { taskId?: string; reason?: string } | null;
    try {
      const wakeup = await app.heartbeatService.enqueueWakeup(request.params.id, projectId, {
        source: "on_demand",
        taskId: body?.taskId,
        reason: body?.reason,
      });
      return reply.code(201).send(wakeup);
    } catch (err) {
      const message = (err as Error).message;
      if (message === "Agent not found") {
        return reply.code(404).send({ error: "not_found", message });
      }
      if (message.includes("paused")) {
        return reply.code(409).send({ error: "conflict", message });
      }
      throw err;
    }
  });

  // POST /api/agents/:id/clone — Clone agent definition to another project
  app.post("/api/agents/:id/clone", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = CloneAgentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "validation_error",
        details: parsed.error.issues,
      });
    }

    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    try {
      const cloned = await app.agentService.clone(
        request.params.id,
        projectId,
        parsed.data,
      );
      return reply.code(201).send(cloned);
    } catch (err) {
      const message = (err as Error).message;
      if (message === "Agent not found") {
        return reply.code(404).send({ error: "not_found", message });
      }
      if (message.includes("duplicate") || message.includes("unique")) {
        return reply.code(409).send({ error: "conflict", message: "Agent with this ID already exists in target project" });
      }
      throw err;
    }
  });
}
