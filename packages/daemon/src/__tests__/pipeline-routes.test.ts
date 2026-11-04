import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createAsyncWork } from "./helpers/async-work.js";
import { eq } from "drizzle-orm";
import { EventEmitter } from "node:events";
import { Writable, Readable } from "node:stream";
import { projects, agents, pipelineTemplates, pipelines, pipelineSteps, tasks, heartbeatRuns } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { buildServer } from "../server.js";
import { globalConfigSchema } from "../config/schema.js";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { hashAgentToken } from "../api/middleware/agent-token.js";

function createMockProcess() {
  const stdin = new Writable({
    write(_chunk, _encoding, callback) { callback(); },
  });
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const proc = Object.assign(new EventEmitter(), {
    stdin, stdout, stderr, pid: 55555,
    kill: vi.fn(() => { proc.emit("close", 0, null); return true; }),
  });
  return proc;
}

describe("Pipeline API routes", () => {
  let testDb: TestDb;
  let app: ReturnType<typeof buildServer>;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Route Test",
      slug: "route-test",
      homeDir: "/tmp/route",
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values({
      id: "route-agent-a",
      projectId,
      name: "Agent A",
      role: "engineer",
    });
  }, 60_000);

  let work: ReturnType<typeof createAsyncWork> | undefined;

  async function cleanupFixture() {
    if (!work) return;
    const owned = work;
    work = undefined;
    // Release held work and join final queue promotion before app.close ends SQL.
    app.schedulerService.stop();
    await owned.cleanup();
  }

  afterEach(cleanupFixture);
  afterAll(async () => {
    try { await cleanupFixture(); } finally { await teardownTestDb(testDb); }
  });

  beforeEach(async () => {
    await cleanupFixture();
    app = buildServer({
      databaseUrl: testDb.connectionUri,
      spawnFn: vi.fn(() => createMockProcess()) as unknown as typeof import("node:child_process").spawn,
      // Enable the loopback-admin bypass so test requests (source IP
      // 127.0.0.1 under app.inject) pass auth without Bearer tokens.
      config: globalConfigSchema.parse({ auth: { allow_localhost_admin: true } }),
    });
    const owner = app;
    work = createAsyncWork(owner.heartbeatService, "executeRun", () => owner.close());
    owner.heartbeatService.setLogger(work.logger);
    owner.heartbeatService.setErrorLogger(work.errorLogger as Parameters<typeof owner.heartbeatService.setErrorLogger>[0]);
    await app.ready();
    await app.initPromise;
    await testDb.db.delete(tasks);
    await testDb.db.delete(pipelineSteps);
    await testDb.db.delete(pipelines);
    await testDb.db.delete(pipelineTemplates);
  });

  it("returns 409 for stale completion and generic pipeline done", async () => {
    const { pipeline, steps, firstTask } = await app.pipelineService.create({ projectId, name: "stale", steps: [{ label: "work" }] });
    await app.pipelineService.failStep(pipeline.id, steps[0].id, firstTask.id);
    const replacement = await app.pipelineService.retry(pipeline.id);
    const stale = await app.inject({ method: "POST", url: `/api/tasks/${firstTask.id}/complete`, payload: { output: "late" } });
    expect(stale.statusCode).toBe(409);
    const bypass = await app.inject({ method: "PATCH", url: `/api/tasks/${replacement.nextTask!.id}`, payload: { column: "done" } });
    expect(bypass.statusCode).toBe(409);
    expect((await app.pipelineService.getWithSteps(pipeline.id))!.steps[0].status).toBe("pending");
  });

  it.each(["success", "assertion", "rejection", "logger", "errorLogger"] as const)(
    "joins final queue cleanup before closing connections: %s", async (failure) => {
      const owner = app;
      const owned = work!;
      const gate = owned.gate();
      const service = owner.heartbeatService;
      const execute = service.executeRun;
      const promote = service.startNextQueuedRunForAgent.bind(service);
      let finished = false;
      let promotions = 0;
      const queue = vi.spyOn(service, "startNextQueuedRunForAgent").mockImplementation(async (...args) => {
        if (promotions++ === 0) return promote(...args);
        await gate.hold();
        const result = await promote(...args);
        finished = true;
        if (failure === "rejection") throw new Error("injected queue cleanup rejection");
        if (failure === "logger") owned.logger.error("injected cleanup logger error");
        if (failure === "errorLogger") await owned.errorLogger.record({ code: "injected_cleanup_error" });
        return result;
      });
      const closeStates: { pending: number; finished: boolean; intercepted: boolean }[] = [];
      const close = owner.close.bind(owner);
      const closing = vi.spyOn(owner, "close").mockImplementation((async () => {
        closeStates.push({ pending: owned.pendingCount, finished, intercepted: service.executeRun === execute });
        await close();
      }) as typeof owner.close);
      try {
        const response = await owner.inject({
          method: "POST", url: "/api/pipelines",
          payload: { projectId, name: "Cleanup boundary", steps: [{ label: "work", agentId: "route-agent-a" }] },
        });
        expect(response.statusCode).toBe(201);
        await gate.entered;
        expect(owned.pendingCount).toBe(1);
        const scenario = async () => {
          try {
            if (failure === "assertion") expect("actual").toBe("expected");
          } finally {
            await cleanupFixture();
          }
        };
        if (failure === "success") await scenario();
        else await expect(scenario()).rejects.toThrow({
          assertion: "expected", rejection: "injected queue cleanup rejection",
          logger: "Unexpected service errors", errorLogger: "Unexpected service errors",
        }[failure]);
        if (failure === "rejection") {
          // The queue launcher also logs the rejection; require that exact diagnostic.
          await expect(owned.drain()).rejects.toThrow("Unhandled error in executeRun");
        }
        expect(closeStates).toEqual([{ pending: 0, finished: true, intercepted: false }]);
        expect(owned.pendingCount).toBe(0);
        expect(closing).toHaveBeenCalledOnce();
        await expect(owner.inject({ method: "GET", url: "/health" })).rejects.toThrow();
        await expect(owner.db.select().from(agents)).rejects.toThrow();
      } finally {
        gate.release();
        try {
          if (owned.pendingCount > 0 || work === owned) await owned.cleanup();
        } finally { queue.mockRestore(); closing.mockRestore(); }
      }
    }, 10_000,
  );

  it("rejects swallowed lock-cleanup errors even when executeRun fulfills", async () => {
    const owner = app;
    const owned = work!;
    const service = owner.heartbeatService;
    const [run] = await testDb.db.insert(heartbeatRuns).values({
      projectId, agentId: "route-agent-a", invocationSource: "on_demand", status: "queued",
    }).returning();
    await testDb.db.insert(tasks).values({
      projectId, title: "Held lock", executionRunId: run.id,
    });
    service.setAdapter({ runAgent: async () => ({
      sessionId: null, model: null, result: "ok", usage: null, costUsd: null,
      billingType: "api", exitCode: 0, signal: null,
      error: null, errorCode: null, events: [],
    }) } as unknown as Parameters<typeof service.setAdapter>[0]);
    const release = vi.spyOn(service, "releaseTaskLock").mockRejectedValue(new Error("injected lock cleanup failure"));
    try {
      await expect(service.executeRun(run.id)).resolves.toBeUndefined();
      expect(release).toHaveBeenCalledOnce();
      const [finished] = await testDb.db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, run.id));
      expect(finished.status).toBe("succeeded");
      expect(finished.finishedAt).not.toBeNull();
      await expect(cleanupFixture()).rejects.toThrow("lock_release_failed");
      expect(owned.pendingCount).toBe(0);
      await expect(owner.db.select().from(agents)).rejects.toThrow();
      await expect(owner.inject({ method: "GET", url: "/health" })).rejects.toThrow();
    } finally {
      try { await cleanupFixture(); } finally { release.mockRestore(); }
    }
  });

  it("broadcasts one committed done transition across duplicate completion requests", async () => {
    const { firstTask } = await app.pipelineService.create({projectId,name:"completion event",steps:[{label:"work"}]});
    const spy = vi.spyOn(app.broadcastService,"taskTransitioned");
    try {
      const complete = () => app.inject({method:"POST",url:`/api/tasks/${firstTask.id}/complete`,payload:{output:"done"}});
      const responses = await Promise.all([complete(),complete()]);
      expect(responses.map(r => r.statusCode)).toEqual([200,200]);
      expect(spy).toHaveBeenCalledExactlyOnceWith(projectId,{taskId:firstTask.id,from:"backlog",to:"done"});
      expect((await app.taskService.getById(firstTask.id))!.column).toBe("done");
    } finally { spy.mockRestore(); }
  });

  describe("Pipeline Templates", () => {
    it("POST /api/pipeline-templates creates template", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/pipeline-templates",
        payload: {
          projectId,
          name: "Standard",
          steps: [
            { order: 1, label: "research" },
            { order: 2, label: "implement" },
          ],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toMatch(/^ptpl_/);
      expect(body.name).toBe("Standard");
    });

    it("GET /api/pipeline-templates lists templates", async () => {
      await app.inject({
        method: "POST",
        url: "/api/pipeline-templates",
        payload: { projectId, name: "A", steps: [{ order: 1, label: "a" }] },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/pipeline-templates?projectId=${projectId}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(1);
    });
  });

  describe("Pipelines", () => {
    it("shows only the authorized project's tracked working-tree changes, not untracked files or prior commits", async () => {
      const root = await mkdtemp(join(tmpdir(), "orch-pipeline-diff-"));
      try {
        const git = (...args: string[]) => execFileSync("git", args, { cwd: root, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" } });
        git("init", "-q");
        await writeFile(join(root, "tracked.txt"), "committed\n");
        git("add", "tracked.txt");
        git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "baseline");
        await writeFile(join(root, "tracked.txt"), "changed\n");
        await writeFile(join(root, "untracked.txt"), "secret\n");
        await testDb.db.update(projects).set({ homeDir: root }).where(eq(projects.id, projectId));
        const { pipeline } = await app.pipelineService.create({ projectId, name: "diff", steps: [{ label: "work" }] });
        const res = await app.inject({ method: "GET", url: `/api/pipelines/${pipeline.id}/diff` });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ available: true, diff: expect.stringContaining("+changed") });
        expect(res.json().diff).not.toContain("untracked.txt");
        expect(res.json().diff).not.toContain("secret");
        const missing = await app.inject({ method: "GET", url: "/api/pipelines/pipe_missing/diff" });
        expect(missing.statusCode).toBe(404);
        await writeFile(join(root, "tracked.txt"), "committed\n");
        const empty = await app.inject({ method: "GET", url: `/api/pipelines/${pipeline.id}/diff` });
        expect(empty.json()).toMatchObject({ available: true, diff: "" });
      } finally {
        await testDb.db.update(projects).set({ homeDir: "/tmp/route" }).where(eq(projects.id, projectId));
        await rm(root, { recursive: true, force: true });
      }
    });

    it("does not disclose a different project's diff to an agent", async () => {
      const token = "pipeline-diff-scoped-token";
      await testDb.db.update(agents).set({ agentTokenHash: hashAgentToken(token) }).where(eq(agents.id, "route-agent-a"));
      const [other] = await testDb.db.insert(projects).values({ name: "Other", slug: `other-${Date.now()}`, homeDir: "/tmp/private" }).returning();
      const { pipeline } = await app.pipelineService.create({ projectId: other.id, name: "private", steps: [{ label: "work" }] });
      const res = await app.inject({ method: "GET", url: `/api/pipelines/${pipeline.id}/diff`, headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(403);
      expect(res.body).not.toContain("/tmp/private");
    });

    it("reports a non-git project without leaking its configured path", async () => {
      const root = await mkdtemp(join(tmpdir(), "orch-pipeline-no-git-"));
      try {
        await testDb.db.update(projects).set({ homeDir: root }).where(eq(projects.id, projectId));
        const { pipeline } = await app.pipelineService.create({ projectId, name: "no git", steps: [{ label: "work" }] });
        const res = await app.inject({ method: "GET", url: `/api/pipelines/${pipeline.id}/diff` });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ available: false, diff: "" });
        expect(res.body).not.toContain(root);
      } finally {
        await testDb.db.update(projects).set({ homeDir: "/tmp/route" }).where(eq(projects.id, projectId));
        await rm(root, { recursive: true, force: true });
      }
    });
    it("POST /api/pipelines creates pipeline with steps", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/pipelines",
        payload: {
          projectId,
          name: "Auth system",
          steps: [
            { label: "research", agentId: "route-agent-a" },
            { label: "implement", agentId: "route-agent-a" },
          ],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.pipeline.id).toMatch(/^pipe_/);
      expect(body.steps).toHaveLength(2);
      expect(body.steps[0].taskId).not.toBeNull();
    });

    it("GET /api/pipelines/:id returns pipeline with steps", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/pipelines",
        payload: {
          projectId,
          name: "Fetch test",
          steps: [{ label: "work", agentId: "route-agent-a" }],
        },
      });
      const created = createRes.json();

      const res = await app.inject({
        method: "GET",
        url: `/api/pipelines/${created.pipeline.id}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().pipeline.name).toBe("Fetch test");
    });

    it("POST /api/pipelines/:id/cancel cancels pipeline", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/pipelines",
        payload: {
          projectId,
          name: "Cancel test",
          steps: [{ label: "work", agentId: "route-agent-a" }],
        },
      });
      const created = createRes.json();

      const res = await app.inject({
        method: "POST",
        url: `/api/pipelines/${created.pipeline.id}/cancel`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("cancelled");
    });

    it("PATCH /api/pipelines/:id/steps/:stepId updates step", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/pipelines",
        payload: {
          projectId,
          name: "Step update test",
          steps: [
            { label: "a", agentId: "route-agent-a" },
            { label: "b", agentId: "route-agent-a" },
          ],
        },
      });
      const created = createRes.json();
      const secondStep = created.steps[1];

      const res = await app.inject({
        method: "PATCH",
        url: `/api/pipelines/${created.pipeline.id}/steps/${secondStep.id}`,
        payload: { status: "skipped" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("skipped");
    });

    it("POST /api/pipelines/:id/steps/:stepId/approve approves a verification step", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/pipelines",
        payload: {
          projectId,
          name: "Approve route test",
          steps: [
            { label: "plan", agentId: "route-agent-a", requiresVerification: true },
            { label: "implement", agentId: "route-agent-a" },
          ],
        },
      });
      const created = createRes.json();
      const planStep = created.steps[0];

      // Complete the step (agent finishes work) — will pause at awaiting_verification
      // We need to complete via the task route, but for simplicity we'll use the service directly
      await app.pipelineService.completeStep(
        created.pipeline.id,
        planStep.id, (await app.pipelineService.getWithSteps(created.pipeline.id))!.steps.find(s => s.id === planStep.id)!.taskId!,
        "Plan output",
        ".orch8/pipelines/test/plan.md",
      );

      const res = await app.inject({
        method: "POST",
        url: `/api/pipelines/${created.pipeline.id}/steps/${planStep.id}/approve`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.approvedStep.status).toBe("completed");
      expect(body.nextStep).not.toBeNull();
      expect(body.nextTask).not.toBeNull();
      expect(body.pipeline.currentStep).toBe(2);
    });

    it("POST /api/pipelines/:id/steps/:stepId/approve returns 409 for non-verification step", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/pipelines",
        payload: {
          projectId,
          name: "Bad approve route",
          steps: [{ label: "work", agentId: "route-agent-a" }],
        },
      });
      const created = createRes.json();

      const res = await app.inject({
        method: "POST",
        url: `/api/pipelines/${created.pipeline.id}/steps/${created.steps[0].id}/approve`,
      });

      expect(res.statusCode).toBe(409);
    });
  });
});
