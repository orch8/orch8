import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  SubmitVerdictSchema,
  ImplementerResponseSchema,
  RefereeVerdictSchema,
  SpawnVerifierSchema,
  SpawnRefereeSchema,
} from "@orch/shared";
import "../../types.js";

export async function verificationRoutes(app: FastifyInstance) {
  // POST /api/tasks/:id/verify — Verifier submits verdict
  app.post(
    "/api/tasks/:id/verify",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const parsed = SubmitVerdictSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation_error",
          details: parsed.error.issues,
        });
      }

      try {
        const result = await app.verificationService.submitVerdict(
          request.params.id,
          parsed.data,
        );
        return result;
      } catch (err) {
        if ((err as Error).message === "Task not found") {
          return reply.code(404).send({ error: "not_found", message: "Task not found" });
        }
        throw err;
      }
    },
  );

  // POST /api/tasks/:id/implementer-response — Implementer responds to verdict
  app.post(
    "/api/tasks/:id/implementer-response",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const parsed = ImplementerResponseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation_error",
          details: parsed.error.issues,
        });
      }

      try {
        const result = await app.verificationService.submitImplementerResponse(
          request.params.id,
          parsed.data,
        );
        return result;
      } catch (err) {
        if ((err as Error).message === "Task not found") {
          return reply.code(404).send({ error: "not_found", message: "Task not found" });
        }
        throw err;
      }
    },
  );

  // POST /api/tasks/:id/referee-verdict — Referee submits final verdict
  app.post(
    "/api/tasks/:id/referee-verdict",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const parsed = RefereeVerdictSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation_error",
          details: parsed.error.issues,
        });
      }

      try {
        const result = await app.verificationService.submitRefereeVerdict(
          request.params.id,
          parsed.data,
        );
        return result;
      } catch (err) {
        if ((err as Error).message === "Task not found") {
          return reply.code(404).send({ error: "not_found", message: "Task not found" });
        }
        throw err;
      }
    },
  );

  // POST /api/tasks/:id/spawn-verifier — Trigger verification for a task in review
  app.post(
    "/api/tasks/:id/spawn-verifier",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const parsed = SpawnVerifierSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation_error",
          details: parsed.error.issues,
        });
      }

      try {
        await app.verificationService.spawnVerifier(
          request.params.id,
          parsed.data.verifierAgentId,
        );
        return { ok: true };
      } catch (err) {
        if ((err as Error).message === "Task not found") {
          return reply.code(404).send({ error: "not_found", message: "Task not found" });
        }
        throw err;
      }
    },
  );

  // POST /api/tasks/:id/spawn-referee — Trigger referee for a disputed task
  app.post(
    "/api/tasks/:id/spawn-referee",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const parsed = SpawnRefereeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation_error",
          details: parsed.error.issues,
        });
      }

      try {
        await app.verificationService.spawnReferee(
          request.params.id,
          parsed.data.refereeAgentId,
        );
        return { ok: true };
      } catch (err) {
        if ((err as Error).message === "Task not found") {
          return reply.code(404).send({ error: "not_found", message: "Task not found" });
        }
        throw err;
      }
    },
  );
}
