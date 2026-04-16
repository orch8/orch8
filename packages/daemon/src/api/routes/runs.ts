import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, and, desc, inArray, asc } from "drizzle-orm";
import { heartbeatRuns, runEvents, projects } from "@orch/shared/db";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getRunLogDir } from "../../services/run-logger.js";
import "../../types.js";

export async function runRoutes(app: FastifyInstance) {
  // GET /api/runs — List runs
  app.get("/api/runs", async (request: FastifyRequest, reply: FastifyReply) => {
    const projectId = request.projectId;

    // Agents must have a projectId; admins can omit it for cross-project view
    if (request.agent && !projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    const params = request.query as { agentId?: string; status?: string; taskId?: string; limit?: string };

    const conditions = [];
    if (projectId) conditions.push(eq(heartbeatRuns.projectId, projectId));
    if (params.agentId) conditions.push(eq(heartbeatRuns.agentId, params.agentId));
    if (params.status) conditions.push(eq(heartbeatRuns.status, params.status as typeof heartbeatRuns.status.enumValues[number]));
    if (params.taskId) conditions.push(eq(heartbeatRuns.taskId, params.taskId));

    const limit = Math.min(parseInt(params.limit ?? "100", 10), 500);

    let query = app.db
      .select()
      .from(heartbeatRuns);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const runs = await query
      .orderBy(desc(heartbeatRuns.createdAt))
      .limit(limit);

    return runs;
  });

  // GET /api/runs/:id — Get single run
  app.get("/api/runs/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    const [run] = await app.db
      .select()
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.id, request.params.id),
          eq(heartbeatRuns.projectId, projectId),
        ),
      );

    if (!run) {
      return reply.code(404).send({ error: "not_found", message: "Run not found" });
    }

    return run;
  });

  // GET /api/runs/:id/events — Get structured events for a run
  app.get("/api/runs/:id/events", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    const events = await app.db
      .select()
      .from(runEvents)
      .where(
        and(
          eq(runEvents.runId, request.params.id),
          eq(runEvents.projectId, projectId),
        ),
      )
      .orderBy(asc(runEvents.seq));

    return events;
  });

  // POST /api/runs/:id/cancel — Cancel a queued or running run
  app.post("/api/runs/:id/cancel", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    // Atomic conditional update to avoid race with scheduler
    const [updated] = await app.db
      .update(heartbeatRuns)
      .set({ status: "cancelled", finishedAt: new Date() })
      .where(
        and(
          eq(heartbeatRuns.id, request.params.id),
          eq(heartbeatRuns.projectId, projectId),
          inArray(heartbeatRuns.status, ["queued", "running"]),
        ),
      )
      .returning();

    if (updated) {
      return updated;
    }

    // Distinguish 404 vs 409
    const [existing] = await app.db
      .select({ status: heartbeatRuns.status })
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.id, request.params.id),
          eq(heartbeatRuns.projectId, projectId),
        ),
      );

    if (!existing) {
      return reply.code(404).send({ error: "not_found", message: "Run not found" });
    }

    return reply.code(409).send({
      error: "conflict",
      message: `Cannot cancel run with status '${existing.status}'`,
    });
  });

  // POST /api/runs/:id/retry — Re-dispatch a failed or cancelled run for the same
  // agent/task. Uses the standard heartbeat wakeup machinery so budget checks,
  // pause state, and queue coalescing all apply.
  app.post("/api/runs/:id/retry", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    const [run] = await app.db
      .select()
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.id, request.params.id),
          eq(heartbeatRuns.projectId, projectId),
        ),
      );

    if (!run) {
      return reply.code(404).send({ error: "not_found", message: "Run not found" });
    }

    if (run.status !== "failed" && run.status !== "cancelled") {
      return reply.code(409).send({
        error: "conflict",
        message: `Cannot retry run with status '${run.status}' — only failed or cancelled runs are retryable`,
      });
    }

    try {
      const wakeup = await app.heartbeatService.enqueueWakeup(run.agentId, projectId, {
        source: "on_demand",
        taskId: run.taskId ?? undefined,
        reason: `retry of run ${run.id}`,
      });
      return reply.code(202).send({
        status: wakeup.status,
        wakeupId: wakeup.id,
        newRunId: wakeup.runId,
      });
    } catch (err) {
      const message = (err as Error).message;
      if (message === "Agent not found") {
        return reply.code(404).send({ error: "not_found", message });
      }
      if (message === "Cannot wake a paused agent" || message.toLowerCase().includes("paused")) {
        return reply.code(409).send({ error: "conflict", message });
      }
      throw err;
    }
  });

  // GET /api/runs/:id/log — Get run log content.
  //
  // Defense-in-depth: `run.logRef` is server-derived today, but any
  // future code path that writes a user-influenced value to `logRef`
  // (or a restored-from-backup DB) would give an arbitrary local-file
  // read primitive. We resolve logRef and the project's log directory,
  // then require one to be a prefix of the other before opening the
  // file. IO errors are separated: ENOENT → 404, everything else → 500
  // with the error logged.
  app.get("/api/runs/:id/log", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const projectId = request.projectId;
    if (!projectId) {
      return reply.code(400).send({ error: "validation_error", message: "projectId is required" });
    }

    const [run] = await app.db
      .select({ logStore: heartbeatRuns.logStore, logRef: heartbeatRuns.logRef })
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.id, request.params.id),
          eq(heartbeatRuns.projectId, projectId),
        ),
      );

    if (!run || !run.logRef) {
      return reply.code(404).send({ error: "not_found", message: "No log found for this run" });
    }

    const [project] = await app.db
      .select({ homeDir: projects.homeDir })
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      return reply.code(404).send({ error: "not_found", message: "Project not found" });
    }

    const expectedLogDir = getRunLogDir(project.homeDir);
    const resolvedRef = path.resolve(run.logRef);
    const boundaryDir = expectedLogDir.endsWith(path.sep)
      ? expectedLogDir
      : expectedLogDir + path.sep;
    if (!resolvedRef.startsWith(boundaryDir)) {
      request.log.warn(
        { runId: run, logRef: run.logRef, resolvedRef, expectedLogDir },
        "Refused to serve run log outside project logDir",
      );
      return reply.code(403).send({
        error: "forbidden",
        message: "Log path is outside the project log directory",
      });
    }

    const params = request.query as { tail?: string };

    let raw: string;
    try {
      raw = await readFile(resolvedRef, "utf-8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return reply.code(404).send({ error: "not_found", message: "Log file not found" });
      }
      request.log.error({ err, logRef: resolvedRef }, "Failed to read run log");
      return reply.code(500).send({ error: "internal_error", message: "Failed to read log file" });
    }

    let content = raw;
    if (params.tail) {
      const n = parseInt(params.tail, 10);
      const lines = raw.split("\n").filter(Boolean);
      content = lines.slice(-n).join("\n");
    }

    return { content, store: run.logStore, bytes: Buffer.byteLength(raw) };
  });
}
