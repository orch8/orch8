import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createAsyncWork } from "./helpers/async-work.js";
import { eq } from "drizzle-orm";
import { EventEmitter } from "node:events";
import { Writable, Readable } from "node:stream";
import { projects, agents, pipelineTemplates, pipelines, pipelineSteps, tasks, heartbeatRuns } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { buildServer } from "../server.js";
import { globalConfigSchema } from "../config/schema.js";
import { mkdtemp, mkdir, symlink, writeFile, rm } from "node:fs/promises";
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

  it("shows the recorded plan file but refuses symlinks and paths outside the pipeline", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "orch8-plan-view-"));
    try {
      await testDb.db.update(projects).set({ homeDir }).where(eq(projects.id, projectId));
      const { pipeline, steps, firstTask } = await app.pipelineService.create({
        projectId, name: "Inspect plan", steps: [{ label: "Plan", requiresVerification: true }],
      });
      const dir = join(homeDir, ".orch8", "pipelines", pipeline.id);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "Plan.md"), "# Actual plan\nBuild a user-facing view.\n");
      await app.pipelineService.completeStep(pipeline.id, steps[0].id, firstTask.id, "Plan ready");
      const url = `/api/pipelines/${pipeline.id}/steps/${steps[0].id}/output`;
      const result = await app.inject({ method: "GET", url });
      expect(result.statusCode).toBe(200);
      expect(result.json()).toMatchObject({ content: "# Actual plan\nBuild a user-facing view.\n" });
      await rm(join(dir, "Plan.md"));
      await writeFile(join(homeDir, "private.txt"), "PRIVATE");
      await symlink(join(homeDir, "private.txt"), join(dir, "Plan.md"));
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(404);
      await rm(dir, { recursive: true });
      const otherDir = join(homeDir, "unrelated");
      await mkdir(otherDir);
      await writeFile(join(otherDir, "Plan.md"), "NOT PIPELINE OUTPUT");
      await symlink(otherDir, dir);
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(404);
      await testDb.db.update(pipelineSteps).set({ outputFilePath: "../../private.txt" }).where(eq(pipelineSteps.id, steps[0].id));
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(404);
    } finally {
      await testDb.db.update(projects).set({ homeDir: "/tmp/route" }).where(eq(projects.id, projectId));
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  it("offers retry when an agent exits without completing its plan task", async () => {
    app.heartbeatService.setAdapter({ runAgent: async () => ({
      sessionId: null, model: null, result: "I could not run commands", usage: null,
      costUsd: null, billingType: "api", exitCode: 0, signal: null,
      error: null, errorCode: null, events: [],
    }) } as unknown as Parameters<typeof app.heartbeatService.setAdapter>[0]);
    const { pipeline, steps, firstTask } = await app.pipelineService.create({
      projectId, name: "Blocked plan", steps: [{ label: "Plan", agentId: "route-agent-a", requiresVerification: true }],
    });
    await app.heartbeatService.enqueueWakeup("route-agent-a", projectId, {
      source: "automation", taskId: firstTask.id, reason: "pipeline_step_ready",
    });
    await work!.drain();
    const stalled = await app.inject({ method: "GET", url: `/api/pipelines/${pipeline.id}` });
    expect(stalled.json().pipeline.status).toBe("failed");
    expect(stalled.json().steps[0].status).toBe("failed");
    expect(stalled.json().steps[0].taskId).toBe(firstTask.id);
    const retry = await app.inject({ method: "POST", url: `/api/pipelines/${pipeline.id}/retry` });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().nextTask.id).not.toBe(firstTask.id);
    expect(retry.json().nextStep.id).toBe(steps[0].id);
  });

  it("offers retry when the assigned agent process throws", async () => {
    const failingAdapter = { runAgent: async () => { throw new Error("runtime unavailable"); } };
    app.heartbeatService.setAdapter(failingAdapter as unknown as Parameters<typeof app.heartbeatService.setAdapter>[0]);
    const { pipeline, firstTask } = await app.pipelineService.create({
      projectId, name: "Runtime failure", steps: [{ label: "Plan", agentId: "route-agent-a" }],
    });
    await app.heartbeatService.enqueueWakeup("route-agent-a", projectId, {
      source: "automation", taskId: firstTask.id,
    });
    await work!.drain();
    const result = await app.pipelineService.getWithSteps(pipeline.id);
    expect(result!.pipeline.status).toBe("failed");
    expect(result!.steps[0].status).toBe("failed");
  });

  it("does not fail an assigned step when another agent wakes its task", async () => {
    await testDb.db.insert(agents).values({ id: "route-agent-b", projectId, name: "Agent B", role: "engineer" });
    app.heartbeatService.setAdapter({ runAgent: async () => ({
      sessionId: null, model: null, result: "no change", usage: null,
      costUsd: null, billingType: "api", exitCode: 0, signal: null,
      error: null, errorCode: null, events: [],
    }) } as unknown as Parameters<typeof app.heartbeatService.setAdapter>[0]);
    const { pipeline, firstTask } = await app.pipelineService.create({
      projectId, name: "Assigned only", steps: [{ label: "Plan", agentId: "route-agent-a" }],
    });
    await app.heartbeatService.enqueueWakeup("route-agent-b", projectId, {
      source: "on_demand", taskId: firstTask.id,
    });
    await work!.drain();
    expect((await app.pipelineService.getWithSteps(pipeline.id))!.pipeline.status).toBe("pending");
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

  it("prepares a branch for an authorized admin and refuses agent writes", async () => {
    const root = await mkdtemp(join(tmpdir(), "orch-prepare-route-"));
    try {
      const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } }).trim();
      git("init", "-q", "-b", "main");
      git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "base");
      await testDb.db.update(projects).set({ homeDir: root, defaultBranch: "main" }).where(eq(projects.id, projectId));
      const url = `/api/projects/${projectId}/feature-branch`;
      const token = "branch-preparation-agent-token";
      await testDb.db.update(agents).set({ agentTokenHash: hashAgentToken(token) }).where(eq(agents.id, "route-agent-a"));
      expect((await app.inject({ method: "POST", url, headers: { authorization: `Bearer ${token}` }, payload: { name: "feat/test" } })).statusCode).toBe(403);
      const [other] = await testDb.db.insert(projects).values({ name: "Other branch project", slug: `other-branch-${Date.now()}`, homeDir: "/tmp/private-branch" }).returning();
      expect((await app.inject({ method: "GET", url: `/api/projects/${other.id}/feature-branch`, headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(403);
      expect((await app.inject({ method: "GET", url })).json()).toMatchObject({ ready: true, branch: "main", baseBranch: "main" });
      const created = await app.inject({ method: "POST", url, payload: { name: "feat/test" } });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ branch: "feat/test", baseBranch: "main" });
      expect(git("branch", "--show-current")).toBe("feat/test");
      expect((await app.inject({ method: "POST", url, payload: { name: "feat/second" } })).statusCode).toBe(409);
      expect((await app.inject({ method: "POST", url, payload: { name: "feat/test" } })).statusCode).toBe(409);
    } finally {
      await testDb.db.update(projects).set({ homeDir: "/tmp/route", defaultBranch: "main" }).where(eq(projects.id, projectId));
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns to base for an admin, but refuses agents, active pipelines and queued writers", async () => {
    const root = await mkdtemp(join(tmpdir(), "orch-return-route-"));
    try {
      const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } }).trim();
      git("init", "-q", "-b", "main");
      git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "base");
      git("switch", "-q", "-c", "feat/previous");
      await testDb.db.update(projects).set({ homeDir: root, defaultBranch: "main" }).where(eq(projects.id, projectId));
      const url = `/api/projects/${projectId}/return-to-base`;
      const token = "return-to-base-agent-token";
      await testDb.db.update(agents).set({ agentTokenHash: hashAgentToken(token) }).where(eq(agents.id, "route-agent-a"));
      expect((await app.inject({ method: "POST", url, headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(403);
      const [other] = await testDb.db.insert(projects).values({ name: "Other return project", slug: `other-return-${Date.now()}`, homeDir: root }).returning();
      expect((await app.inject({ method: "POST", url: `/api/projects/${other.id}/return-to-base`, headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(403);
      const active = await app.pipelineService.create({ projectId, name: "Still working", steps: [{ label: "Plan" }] });
      const blocked = await app.inject({ method: "POST", url });
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().message).toMatch(/active pipeline/i);
      expect(git("branch", "--show-current")).toBe("feat/previous");
      await app.pipelineService.cancel(active.pipeline.id);
      const shared = await app.pipelineService.create({ projectId: other.id, name: "Shared repository writer", steps: [{ label: "Plan" }] });
      expect((await app.inject({ method: "POST", url })).json().message).toMatch(/active pipeline/i);
      await app.pipelineService.cancel(shared.pipeline.id);
      const [run] = await testDb.db.insert(heartbeatRuns).values({ projectId, agentId: "route-agent-a", invocationSource: "on_demand", status: "queued" }).returning();
      expect((await app.inject({ method: "POST", url })).json().message).toMatch(/agent run/i);
      await testDb.db.update(heartbeatRuns).set({ status: "cancelled" }).where(eq(heartbeatRuns.id, run.id));
      const [sharedRun] = await testDb.db.insert(heartbeatRuns).values({ projectId: other.id, agentId: "route-agent-a", invocationSource: "on_demand", status: "running" }).returning();
      expect((await app.inject({ method: "POST", url })).json().message).toMatch(/agent run/i);
      await testDb.db.update(heartbeatRuns).set({ status: "cancelled" }).where(eq(heartbeatRuns.id, sharedRun.id));
      await writeFile(join(root, "manual.txt"), "external edit");
      expect((await app.inject({ method: "POST", url })).json().message).toMatch(/completely clean/i);
      expect(git("branch", "--show-current")).toBe("feat/previous");
      await rm(join(root, "manual.txt"));
      const returned = await app.inject({ method: "POST", url });
      expect(returned.statusCode).toBe(200);
      expect(returned.json()).toEqual({ branch: "main", baseBranch: "main" });
      expect(git("branch", "--show-current")).toBe("main");
    } finally {
      await testDb.db.update(projects).set({ homeDir: "/tmp/route", defaultBranch: "main" }).where(eq(projects.id, projectId));
      await rm(root, { recursive: true, force: true });
    }
  });

  describe("Pipelines", () => {
    it("refuses publication before a completed independent review", async () => {
      const created = await app.pipelineService.create({ projectId, name: "Review gate", steps: [
        { label: "implement", agentId: "route-agent-a" },
        { label: "review", agentId: "route-agent-a" },
      ] });
      const url = `/api/pipelines/${created.pipeline.id}/pull-request`;
      expect((await app.inject({ method: "POST", url })).statusCode).toBe(409);
      const next = await app.pipelineService.completeStep(created.pipeline.id, created.steps[0].id, created.firstTask.id, "implemented");
      await app.pipelineService.completeStep(created.pipeline.id, created.steps[1].id, next.nextTask!.id, "reviewed");
      const response = await app.inject({ method: "POST", url });
      expect(response.statusCode).toBe(409);
      expect(response.json().message).toMatch(/independent/i);
    });
    it("accepts the feature intake's independent review after its approval gate", async () => {
      await testDb.db.insert(agents).values({ id: "route-reviewer", projectId, name: "Reviewer", role: "reviewer" });
      const created = await app.pipelineService.create({ projectId, name: "Actual intake", steps: [
        { label: "Plan", agentId: "route-agent-a", requiresVerification: true },
        { label: "Implement", agentId: "route-agent-a" },
        { label: "Independent review", agentId: "route-reviewer", requiresVerification: true },
      ] });
      const plan = await app.pipelineService.completeStep(created.pipeline.id, created.steps[0].id, created.firstTask.id, "Plan ready");
      expect(plan.completedStep.status).toBe("awaiting_verification");
      const approved = await app.pipelineService.approveStep(created.pipeline.id, created.steps[0].id);
      const implemented = await app.pipelineService.completeStep(created.pipeline.id, created.steps[1].id, approved.nextTask!.id, "Implemented");
      const reviewed = await app.pipelineService.completeStep(created.pipeline.id, created.steps[2].id, implemented.nextTask!.id, "Independent review passed");
      expect(reviewed.completedStep.status).toBe("awaiting_verification");
      expect((await app.inject({ method: "POST", url: `/api/pipelines/${created.pipeline.id}/pull-request` })).statusCode).toBe(409);
      await app.pipelineService.approveStep(created.pipeline.id, created.steps[2].id);
      const response = await app.inject({ method: "POST", url: `/api/pipelines/${created.pipeline.id}/pull-request` });
      // The review guard passed; the fixture deliberately has no GitHub repo configured.
      expect(response.statusCode).toBe(409);
      expect(response.json().message).toMatch(/Configure a GitHub repository URL/);
    });

    it("shows committed branch, staged and unstaged changes separately and lists untracked paths", async () => {
      const root = await mkdtemp(join(tmpdir(), "orch-pipeline-branch-"));
      try {
        const git = (...args: string[]) => execFileSync("git", args, { cwd: root, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } });
        git("init", "-q");
        git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "base");
        git("branch", "stable");
        git("switch", "-qc", "feature");
        await writeFile(join(root, "committed.txt"), "committed branch work\n");
        git("add", "committed.txt");
        git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "feature");
        await writeFile(join(root, "staged.txt"), "staged work\n");
        git("add", "staged.txt");
        await writeFile(join(root, "committed.txt"), "committed branch work\nunstaged work\n");
        await writeFile(join(root, "untracked.txt"), "untracked secret content\n");
        await testDb.db.update(projects).set({ homeDir: root, defaultBranch: "stable" }).where(eq(projects.id, projectId));
        const { pipeline } = await app.pipelineService.create({ projectId, name: "branch diff", steps: [{ label: "work" }] });
        const response = await app.inject({ method: "GET", url: `/api/pipelines/${pipeline.id}/diff` });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          available: true, baseBranch: "stable", branch: "feature", prLookup: "unavailable",
          pullRequest: null, untrackedFiles: ["untracked.txt"], untrackedMore: false,
        });
        expect(response.json().committedDiff).toContain("+committed branch work");
        expect(response.json().committedDiff).not.toContain("staged.txt");
        expect(response.json().workingDiff).toContain("+staged work");
        expect(response.json().workingDiff).toContain("+unstaged work");
        expect(response.json().diff).not.toContain("untracked secret content");
        // A stale local base must not override a newer fetched origin base.
        git("update-ref", "refs/remotes/origin/stable", "HEAD");
        const refreshed = await app.inject({ method: "GET", url: `/api/pipelines/${pipeline.id}/diff` });
        expect(refreshed.json().committedDiff).toBe("");
      } finally {
        await testDb.db.update(projects).set({ homeDir: "/tmp/route", defaultBranch: "main" }).where(eq(projects.id, projectId));
        await rm(root, { recursive: true, force: true });
      }
    });

    it("reads project repository changes without a pipeline and scopes agent access", async () => {
      const root = await mkdtemp(join(tmpdir(), "orch-project-changes-"));
      try {
        const git = (...args: string[]) => execFileSync("git", args, { cwd: root, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } });
        git("init", "-q", "-b", "stable");
        git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "base");
        git("switch", "-qc", "feature");
        await writeFile(join(root, "committed.txt"), "committed\n");
        git("add", "committed.txt");
        git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "feature");
        await writeFile(join(root, "working.txt"), "staged\n");
        git("add", "working.txt");
        await writeFile(join(root, "untracked.txt"), "private content\n");
        await testDb.db.update(projects).set({ homeDir: root, defaultBranch: "stable" }).where(eq(projects.id, projectId));
        const url = `/api/projects/${projectId}/repository-changes`;
        const response = await app.inject({ method: "GET", url });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ available: true, branch: "feature", baseBranch: "stable", untrackedFiles: ["untracked.txt"] });
        expect(response.json().committedDiff).toContain("+committed");
        expect(response.json().workingDiff).toContain("+staged");
        expect(response.body).not.toContain("private content");
        const token = "project-changes-agent-token";
        await testDb.db.update(agents).set({ agentTokenHash: hashAgentToken(token) }).where(eq(agents.id, "route-agent-a"));
        const headers = { authorization: `Bearer ${token}` };
        expect((await app.inject({ method: "GET", url, headers })).statusCode).toBe(200);
        const [other] = await testDb.db.insert(projects).values({ name: "Private", slug: `private-${Date.now()}`, homeDir: root }).returning();
        expect((await app.inject({ method: "GET", url: `/api/projects/${other.id}/repository-changes`, headers })).statusCode).toBe(403);
        expect((await app.inject({ method: "GET", url: "/api/projects/does-not-exist/repository-changes" })).statusCode).toBe(404);
        expect((await app.inject({ method: "POST", url })).statusCode).toBe(404);
      } finally {
        await testDb.db.update(projects).set({ homeDir: "/tmp/route", defaultBranch: "main" }).where(eq(projects.id, projectId));
        await rm(root, { recursive: true, force: true });
      }
    });

    it("reports a missing configured base instead of showing an incomplete working-tree-only diff", async () => {
      const root = await mkdtemp(join(tmpdir(), "orch-pipeline-no-base-"));
      try {
        const git = (...args: string[]) => execFileSync("git", args, { cwd: root, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } });
        git("init", "-q");
        git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "base");
        await testDb.db.update(projects).set({ homeDir: root, defaultBranch: "missing" }).where(eq(projects.id, projectId));
        const { pipeline } = await app.pipelineService.create({ projectId, name: "no base", steps: [{ label: "work" }] });
        const response = await app.inject({ method: "GET", url: `/api/pipelines/${pipeline.id}/diff` });
        expect(response.json()).toMatchObject({ available: false, diff: "", reason: expect.stringContaining("missing") });
      } finally {
        await testDb.db.update(projects).set({ homeDir: "/tmp/route", defaultBranch: "main" }).where(eq(projects.id, projectId));
        await rm(root, { recursive: true, force: true });
      }
    });

    it("uses the local origin tracking ref when the default branch has no local branch", async () => {
      const root = await mkdtemp(join(tmpdir(), "orch-pipeline-remote-base-"));
      try {
        const git = (...args: string[]) => execFileSync("git", args, { cwd: root, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } });
        git("init", "-q", "-b", "feature");
        git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "base");
        git("update-ref", "refs/remotes/origin/stable", "HEAD");
        await writeFile(join(root, "feature.txt"), "feature\n");
        git("add", "feature.txt");
        git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "feature");
        await testDb.db.update(projects).set({ homeDir: root, defaultBranch: "stable" }).where(eq(projects.id, projectId));
        const { pipeline } = await app.pipelineService.create({ projectId, name: "tracking base", steps: [{ label: "work" }] });
        const response = await app.inject({ method: "GET", url: `/api/pipelines/${pipeline.id}/diff` });
        expect(response.json()).toMatchObject({ available: true, baseBranch: "stable", workingDiff: "" });
        expect(response.json().committedDiff).toContain("+feature");
      } finally {
        await testDb.db.update(projects).set({ homeDir: "/tmp/route", defaultBranch: "main" }).where(eq(projects.id, projectId));
        await rm(root, { recursive: true, force: true });
      }
    });

    it("caps untracked previews without implying that the list is complete", async () => {
      const root = await mkdtemp(join(tmpdir(), "orch-pipeline-untracked-cap-"));
      try {
        const git = (...args: string[]) => execFileSync("git", args, { cwd: root, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } });
        git("init", "-q", "-b", "main");
        git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "base");
        await Promise.all(Array.from({ length: 21 }, (_, i) => writeFile(join(root, `new-${i}.txt`), "private content\n")));
        await testDb.db.update(projects).set({ homeDir: root }).where(eq(projects.id, projectId));
        const { pipeline } = await app.pipelineService.create({ projectId, name: "untracked cap", steps: [{ label: "work" }] });
        const response = await app.inject({ method: "GET", url: `/api/pipelines/${pipeline.id}/diff` });
        expect(response.json()).toMatchObject({ available: true, untrackedMore: true, diff: "" });
        expect(response.json().untrackedFiles).toHaveLength(20);
        expect(response.body).not.toContain("private content");
      } finally {
        await testDb.db.update(projects).set({ homeDir: "/tmp/route" }).where(eq(projects.id, projectId));
        await rm(root, { recursive: true, force: true });
      }
    });

    it("shows only the authorized project's tracked working-tree changes, not untracked file contents", async () => {
      const root = await mkdtemp(join(tmpdir(), "orch-pipeline-diff-"));
      try {
        const git = (...args: string[]) => execFileSync("git", args, { cwd: root, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" } });
        git("init", "-q", "-b", "main");
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
