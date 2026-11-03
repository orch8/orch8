import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { makeFailingTxDb } from "./helpers/failing-tx.js";
import { PipelineService } from "../services/pipeline.service.js";
import { PipelineTemplateService } from "../services/pipeline-template.service.js";
import { TaskService } from "../services/task.service.js";
import { TaskLifecycleService } from "../services/task-lifecycle.service.js";
import { buildServer } from "../server.js";
import { globalConfigSchema } from "../config/schema.js";
import { hashAgentToken } from "../api/middleware/agent-token.js";

describe("remaining atomic progression acceptance", () => {
  let db: TestDb, observer: postgres.Sql, service: PipelineService, tasks: TaskService;
  let lifecycle: TaskLifecycleService, app: ReturnType<typeof buildServer>;
  let projectId: string, otherProjectId: string;
  const agentId = "acceptance-agent", token = "acceptance-token";
  beforeAll(async () => {
    db = await setupTestDb();
    observer = postgres(db.connectionUri, { max: 1 });
    service = new PipelineService(db.db, new PipelineTemplateService(db.db));
    tasks = new TaskService(db.db);
    lifecycle = new TaskLifecycleService(db.db, tasks);
    const projects = await db.db.insert(schema.projects).values([
      { name: "acceptance", slug: "acceptance", homeDir: "/tmp/acceptance" },
      { name: "other", slug: "acceptance-other", homeDir: "/tmp/acceptance-other" },
    ]).returning();
    [projectId, otherProjectId] = projects.map(p => p.id);
    app = buildServer({ databaseUrl: db.connectionUri, config: globalConfigSchema.parse({ auth: { allow_localhost_admin: true } }) });
    await app.ready();
    await app.initPromise;
    app.schedulerService.stop();
    await db.db.insert(schema.agents).values([
      { id: agentId, projectId, name: "worker", agentTokenHash: hashAgentToken(token) },
      { id: "acceptance-other-agent", projectId, name: "other" },
    ]);
  }, 60000);
  afterAll(async () => {
    try { await app?.close(); }
    finally {
      try { await observer?.end(); }
      finally { if (db) await teardownTestDb(db); }
    }
  });
  const create = (gate = false, count = 2) => service.create({ projectId, name: "acceptance", steps:
    Array.from({ length: count }, (_, i) => ({ label: `step-${i}`, requiresVerification: gate && i === count - 2 })) });
  const snapshot = async () => ({
    pipelines: await observer`SELECT * FROM pipelines ORDER BY id`,
    steps: await observer`SELECT * FROM pipeline_steps ORDER BY id`,
    tasks: await observer`SELECT * FROM tasks ORDER BY id`,
    projects: await observer`SELECT * FROM projects ORDER BY id`,
    dependencies: await observer`SELECT * FROM task_dependencies ORDER BY task_id, depends_on_id`,
    runs: await observer`SELECT * FROM heartbeat_runs ORDER BY id`,
  });
  const finish = (p: string, s: string, t: string) => service.completeStep(p, s, t, "original output", "original.md");
  async function run(taskId: string, overrides: Partial<typeof schema.heartbeatRuns.$inferInsert> = {}) {
    const [result] = await db.db.insert(schema.heartbeatRuns).values({ projectId, taskId, agentId, status: "running", invocationSource: "on_demand", ...overrides }).returning();
    return result;
  }
  async function noWrites(action: () => Promise<unknown>) {
    const before = await snapshot();
    await expect(action()).rejects.toMatchObject({ statusCode: 409 });
    expect(await snapshot()).toEqual(before);
  }

  for (const final of [false, true]) {
    for (const boundary of [
      { name: "first step write", failUpdateOnTable: schema.pipelineSteps },
      { name: "pipeline write", failUpdateOnTable: schema.pipelines },
      ...(!final ? [
        { name: "allocator", failUpdateOnTable: schema.projects },
        { name: "insert", failInsertOnTable: schema.tasks },
        { name: "backlink", failUpdateOnTable: schema.pipelineSteps, skip: 1 },
      ] : []),
    ]) it(`A01 approval ${final ? "final" : "successor"} rollback at ${boundary.name}`, async () => {
      const p = await service.create({ projectId, name: "approval rollback", steps: [
        { label: "gate", requiresVerification: true }, ...(!final ? [{ label: "next" }] : []),
      ] });
      await finish(p.pipeline.id, p.steps[0].id, p.firstTask.id);
      const before = await snapshot();
      const failing = new PipelineService(makeFailingTxDb(db.db, boundary), new PipelineTemplateService(db.db));
      await expect(failing.approveStep(p.pipeline.id, p.steps[0].id)).rejects.toThrow("simulated db write failure");
      expect(await snapshot()).toEqual(before);
    });
  }
  for (const skip of [1, 2, 3]) it(`A01 rejection rolls back at reset ${skip} in a multi-step chain`, async () => {
    const p = await create(false, 4);
    let task = p.firstTask.id;
    for (let i = 0; i < 3; i++) task = (await finish(p.pipeline.id, p.steps[i].id, task)).nextTask!.id;
    const before = await snapshot();
    const failing = new PipelineService(makeFailingTxDb(db.db, { failUpdateOnTable: schema.pipelineSteps, skip }), new PipelineTemplateService(db.db));
    await expect(failing.rejectStep(p.pipeline.id, p.steps[3].id, p.steps[0].id, "redo chain")).rejects.toThrow("simulated db write failure");
    expect(await snapshot()).toEqual(before);
  });
  for (const branch of ["successor", "verification", "final"] as const) it(`A01 lost response fresh-service replay has no writes: ${branch}`, async () => {
    const p = await service.create({ projectId, name: "lost response", steps: [
      { label: "one", agentId, requiresVerification: branch === "verification" }, ...(branch === "successor" ? [{ label: "next" }] : []),
    ] });
    const owner = await run(p.firstTask.id);
    await lifecycle.checkout(p.firstTask.id, agentId, owner.id);
    await finish(p.pipeline.id, p.steps[0].id, p.firstTask.id); // Committed result intentionally discarded.
    const before = await snapshot();
    const freshDb = drizzle(observer, { schema });
    const fresh = new PipelineService(freshDb, new PipelineTemplateService(freshDb));
    const result = await fresh.completeStep(p.pipeline.id, p.steps[0].id, p.firstTask.id, "different replay output", "different.md");
    expect(result.nextTask).toBeNull();
    expect(result.nextStep).toBeNull();
    expect(await snapshot()).toEqual(before);
  });
  for (const entry of ["task", "step"] as const) it(`A03 ${entry} assignment rolls back if second write fails`, async () => {
    const p = await create();
    const failing = makeFailingTxDb(db.db, { failUpdateOnTable: entry === "task" ? schema.tasks : schema.pipelineSteps });
    const before = await snapshot();
    await expect(entry === "task" ? new TaskService(failing).update(p.firstTask.id, { assignee: agentId })
      : new PipelineService(failing, new PipelineTemplateService(db.db)).updateStep(p.pipeline.id, p.steps[0].id, { agentId })).rejects.toThrow("simulated db write failure");
    expect(await snapshot()).toEqual(before);
  });
  for (const invalid of ["project", "task", "agent", "queued", "succeeded", "failed", "cancelled"] as const) it(`A03 checkout refuses existing run with wrong ${invalid}`, async () => {
    const p = await create();
    await tasks.update(p.firstTask.id, { assignee: agentId });
    const other = await create();
    const owner = await run(p.firstTask.id, invalid === "project" ? { projectId: otherProjectId }
      : invalid === "task" ? { taskId: other.firstTask.id } : invalid === "agent" ? { agentId: "acceptance-other-agent" } : { status: invalid });
    await noWrites(() => lifecycle.checkout(p.firstTask.id, agentId, owner.id));
  });
  for (const state of ["completed", "cancelled", "superseded"] as const) {
    for (const entry of ["transition", "checkout", "release", "assignment", "step assignment", "add dependency", "remove dependency"] as const) {
      it(`A03 ${state} attempt cannot reopen through ${entry}`, async () => {
        const p = await create();
        await tasks.update(p.firstTask.id, { assignee: agentId });
        const dependency = await tasks.create({ projectId, title: "dependency", taskType: "quick" });
        await tasks.addDependency(p.firstTask.id, dependency.id);
        const owner = await run(p.firstTask.id);
        if (state === "completed") await finish(p.pipeline.id, p.steps[0].id, p.firstTask.id);
        else if (state === "cancelled") await service.cancel(p.pipeline.id);
        else { await service.failStep(p.pipeline.id, p.steps[0].id, p.firstTask.id); await service.retry(p.pipeline.id); }
        // updateStep addresses the CURRENT step, not an old attempt, so it is intentionally valid after retry.
        if (state === "superseded" && entry === "step assignment") {
          const current = (await service.getWithSteps(p.pipeline.id))!.steps[0];
          await service.updateStep(p.pipeline.id, current.id, { agentId });
          expect((await tasks.getById(current.taskId!))!.assignee).toBe(agentId);
          return;
        }
        await noWrites(() => entry === "transition" ? lifecycle.transition(p.firstTask.id, "backlog")
          : entry === "checkout" ? lifecycle.checkout(p.firstTask.id, agentId, owner.id)
          : entry === "release" ? lifecycle.release(p.firstTask.id, agentId, owner.id)
          : entry === "assignment" ? tasks.update(p.firstTask.id, { assignee: null })
          : entry === "step assignment" ? service.updateStep(p.pipeline.id, p.steps[0].id, { agentId: null })
          : entry === "add dependency" ? tasks.addDependency(p.firstTask.id, dependency.id)
          : tasks.removeDependency(p.firstTask.id, dependency.id));
      });
    }
  }
  it("A02 stale failure after retry and stale completion after rejection are no-write conflicts", async () => {
    const p = await create();
    await service.failStep(p.pipeline.id, p.steps[0].id, p.firstTask.id);
    const replacement = await service.retry(p.pipeline.id);
    await noWrites(() => service.failStep(p.pipeline.id, p.steps[0].id, p.firstTask.id));
    const next = await finish(p.pipeline.id, p.steps[0].id, replacement.nextTask!.id);
    await service.rejectStep(p.pipeline.id, p.steps[1].id, p.steps[0].id, "redo");
    await noWrites(() => finish(p.pipeline.id, p.steps[0].id, replacement.nextTask!.id));
    await noWrites(() => finish(p.pipeline.id, p.steps[1].id, next.nextTask!.id));
  });
  for (const field of ["project", "stored step", "backlink"] as const) it(`A03 completed duplicate validates ${field} before returning`, async () => {
    const p = await create();
    await finish(p.pipeline.id, p.steps[0].id, p.firstTask.id);
    if (field === "project") await observer`UPDATE tasks SET project_id = ${otherProjectId} WHERE id = ${p.firstTask.id}`;
    else if (field === "stored step") await observer`UPDATE tasks SET pipeline_step_id = ${p.steps[1].id} WHERE id = ${p.firstTask.id}`;
    else await observer`UPDATE pipeline_steps SET task_id = NULL WHERE id = ${p.steps[0].id}`;
    await noWrites(() => finish(p.pipeline.id, p.steps[0].id, p.firstTask.id));
    await noWrites(() => service.failStep(p.pipeline.id, p.steps[0].id, p.firstTask.id));
  });

  it("A03 public checkout/release require exact run and generic PATCH cannot complete", async () => {
    const p = await create();
    await tasks.update(p.firstTask.id, { assignee: agentId });
    const owner = await run(p.firstTask.id), other = await run(p.firstTask.id);
    const headers = (id: string) => ({ authorization: `Bearer ${token}`, "x-run-id": id });
    const request = (action: string, id: string) => app.inject({ method: "POST", url: `/api/tasks/${p.firstTask.id}/${action}`, headers: headers(id) });
    expect((await request("checkout", owner.id)).statusCode).toBe(200);
    const before = await snapshot();
    expect((await request("checkout", other.id)).statusCode).toBe(409);
    expect((await request("release", other.id)).statusCode).toBe(409);
    expect((await app.inject({ method: "PATCH", url: `/api/tasks/${p.firstTask.id}`, payload: { column: "done" } })).statusCode).toBe(409);
    expect(await snapshot()).toEqual(before);
    expect((await request("release", owner.id)).statusCode).toBe(200);
    expect((await tasks.getById(p.firstTask.id))!.executionRunId).toBeNull();
  });

  it("B4 HTTP distinguishes completed-step conflict, malformed input and missing resource", async () => {
    const p = await create();
    await finish(p.pipeline.id, p.steps[0].id, p.firstTask.id);
    const before = await snapshot();
    const url = `/api/pipelines/${p.pipeline.id}/steps/${p.steps[0].id}`;
    expect((await app.inject({ method: "PATCH", url, payload: { agentId: null } })).statusCode).toBe(409);
    expect((await app.inject({ method: "PATCH", url, payload: { requiresVerification: "invalid" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url: `/api/pipelines/missing/steps/missing`, payload: { agentId: null } })).statusCode).toBe(404);
    expect(await snapshot()).toEqual(before);
  });
  for (const decision of ["approve", "reject"] as const) it(`B4 HTTP non-current ${decision} is 409`, async () => {
    const p = await create(true, 3);
    const next = await finish(p.pipeline.id, p.steps[0].id, p.firstTask.id);
    await finish(p.pipeline.id, p.steps[1].id, next.nextTask!.id);
    await observer`UPDATE pipelines SET current_step = 1 WHERE id = ${p.pipeline.id}`;
    const before = await snapshot();
    const response = await app.inject({ method: "POST", url: `/api/pipelines/${p.pipeline.id}/steps/${p.steps[1].id}/${decision}`,
      ...(decision === "reject" ? { payload: { targetStepId: p.steps[0].id, feedback: "redo" } } : {}) });
    expect(response.statusCode).toBe(409);
    expect(await snapshot()).toEqual(before);
  });
  for (const entry of ["PATCH", "transition"] as const) it(`B4 HTTP invalid pipeline state transition is 409 via ${entry}`, async () => {
    const p = await create();
    const before = await snapshot();
    const response = await app.inject({ method: entry === "PATCH" ? "PATCH" : "POST", url: `/api/tasks/${p.firstTask.id}${entry === "PATCH" ? "" : "/transition"}`, payload: { column: "backlog" } });
    expect(response.statusCode).toBe(409);
    expect(await snapshot()).toEqual(before);
  });
  it("B4 malformed transition and rejection input remain 400, missing decisions remain 404", async () => {
    const p = await create();
    const before = await snapshot();
    for (const column of ["invalid", 12, null]) {
      expect((await app.inject({ method: "POST", url: `/api/tasks/${p.firstTask.id}/transition`, payload: { column } })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: "POST", url: `/api/pipelines/${p.pipeline.id}/steps/${p.steps[1].id}/reject`, payload: {} })).statusCode).toBe(400);
    for (const decision of ["approve", "reject"]) {
      expect((await app.inject({ method: "POST", url: `/api/pipelines/missing/steps/missing/${decision}`,
        ...(decision === "reject" ? { payload: { targetStepId: "missing", feedback: "redo" } } : {}) })).statusCode).toBe(404);
    }
    expect(await snapshot()).toEqual(before);
  });
  it("B4 retry with failed pipeline but no failed current step is a no-write 409", async () => {
    const p = await create();
    await observer`UPDATE pipelines SET status = 'failed' WHERE id = ${p.pipeline.id}`;
    const before = await snapshot();
    expect((await app.inject({ method: "POST", url: `/api/pipelines/${p.pipeline.id}/retry` })).statusCode).toBe(409);
    expect(await snapshot()).toEqual(before);
  });
  // Observe each contender waiting before admitting the next. Both use real independent clients.
  async function orderedRace(pipelineId: string, first: () => Promise<unknown>, second: (other: PipelineService, otherTasks: TaskService, otherLifecycle: TaskLifecycleService) => Promise<unknown>) {
    const client = postgres(db.connectionUri, { max: 1 });
    const blocker = postgres(db.connectionUri, { max: 1 });
    const otherDb = drizzle(client, { schema });
    const otherTasks = new TaskService(otherDb);
    const other = new PipelineService(otherDb, new PipelineTemplateService(otherDb));
    let results!: Promise<PromiseSettledResult<unknown>[]>;
    try {
      await blocker.begin(async raw => {
        const tx = raw as unknown as postgres.Sql;
        await tx`SELECT id FROM projects WHERE id = ${projectId} FOR NO KEY UPDATE`;
        const [{ pid }] = await tx`SELECT pg_backend_pid() AS pid`;
        const wait = async (count: number) => {
          const deadline = Date.now() + 5000;
          while (true) {
            const waiting = await observer`WITH RECURSIVE waiters AS (
              SELECT pid FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))
              UNION SELECT a.pid FROM pg_stat_activity a JOIN waiters w ON w.pid = ANY(pg_blocking_pids(a.pid))
            ) SELECT pid FROM waiters`;
            if (waiting.length === count) return;
            if (Date.now() > deadline) throw new Error(`Missing observed ${count}-client barrier for ${pipelineId}`);
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        };
        const a = first();
        // Attach rejection handlers immediately, including if barrier observation fails.
        const settledA = Promise.allSettled([a]);
        await wait(1);
        const b = second(other, otherTasks, new TaskLifecycleService(otherDb, otherTasks));
        results = Promise.allSettled([a, b]);
        await wait(2);
        void settledA; // Rejection handler only; transactions are still blocked.
      });
      return await results;
    } finally { await client.end(); await blocker.end(); }
  }
  for (const decision of ["approve", "reject"] as const) {
    for (const reverse of [false, true]) it(`A02 approval/${decision} independent barrier, reverse=${reverse}`, async () => {
      const p = await create(true, 3);
      const next = await finish(p.pipeline.id, p.steps[0].id, p.firstTask.id);
      await finish(p.pipeline.id, p.steps[1].id, next.nextTask!.id);
      const before = await snapshot();
      const decide = (s: PipelineService, kind: string) => kind === "approve" ? s.approveStep(p.pipeline.id, p.steps[1].id)
        : s.rejectStep(p.pipeline.id, p.steps[1].id, p.steps[0].id, "race feedback");
      const winner = reverse ? decision : "approve";
      const result = await orderedRace(p.pipeline.id, () => decide(service, winner), other => decide(other, reverse ? "approve" : decision));
      expect(result[0].status).toBe("fulfilled");
      expect(result[1]).toMatchObject({ status: "rejected", reason: { statusCode: 409 } });
      const after = await snapshot();
      expect(after.projects.find(r => r.id === projectId)!.next_task_number).toBe(before.projects.find(r => r.id === projectId)!.next_task_number + 1);
      const state = (await service.getWithSteps(p.pipeline.id))!;
      expect(state.pipeline).toMatchObject({ status: "running", currentStep: winner === "approve" ? 3 : 1 });
      expect(state.steps.map(s => s.status)).toEqual(winner === "approve" ? ["completed", "completed", "pending"] : ["pending", "failed", "pending"]);
      const target = state.steps[winner === "approve" ? 2 : 0];
      const created = after.tasks.filter(t => !before.tasks.some(old => old.id === t.id));
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ id: target.taskId, project_id: projectId, pipeline_id: p.pipeline.id, pipeline_step_id: target.id, assignee: target.agentId, column: "backlog", execution_run_id: null });
      expect(after.tasks.filter(t => before.tasks.some(old => old.id === t.id))).toEqual(before.tasks);
      expect(state.steps[1].outputSummary).toBe(winner === "approve" ? "original output" : "[REJECTED] race feedback");
      if (winner === "reject") expect(state.steps[0]).toMatchObject({ outputSummary: null, outputFilePath: null });
    });
  }
  for (const competing of ["complete", "cancel", "fail", "assign", "dependency", "block"] as const) {
    for (const reverse of [false, true]) it(`A02/A03 ${competing}/completion exact ordered outcomes, reverse=${reverse}`, async () => {
      const p = await create();
      const dependency = await tasks.create({ projectId, title: "race dependency", taskType: "quick" });
      const before = await snapshot();
      const competitor = (s: PipelineService, t: TaskService, l: TaskLifecycleService) => competing === "complete" ? s.completeStep(p.pipeline.id, p.steps[0].id, p.firstTask.id, "original output", "original.md")
        : competing === "cancel" ? s.cancel(p.pipeline.id) : competing === "fail" ? s.failStep(p.pipeline.id, p.steps[0].id, p.firstTask.id)
        : competing === "assign" ? s.updateStep(p.pipeline.id, p.steps[0].id, { agentId })
        : competing === "dependency" ? t.addDependency(p.firstTask.id, dependency.id) : l.transition(p.firstTask.id, "blocked");
      const results = await orderedRace(p.pipeline.id,
        () => reverse ? competitor(service, tasks, lifecycle) : finish(p.pipeline.id, p.steps[0].id, p.firstTask.id),
        (s, t, l) => reverse ? s.completeStep(p.pipeline.id, p.steps[0].id, p.firstTask.id, "original output", "original.md") : competitor(s, t, l));
      expect(results[0].status).toBe("fulfilled");
      const secondSucceeds = reverse ? !["cancel", "fail"].includes(competing) : ["complete", "cancel"].includes(competing);
      if (secondSucceeds) expect(results[1].status).toBe("fulfilled");
      else expect(results[1]).toMatchObject({ status: "rejected", reason: { statusCode: 409 } });
      const completed = !(reverse && ["cancel", "fail"].includes(competing));
      const state = (await service.getWithSteps(p.pipeline.id))!;
      expect(state.pipeline).toMatchObject({ status: competing === "cancel" ? "cancelled" : reverse && competing === "fail" ? "failed" : "running", currentStep: completed ? 2 : 1 });
      expect(state.steps[0]).toMatchObject({ status: completed ? "completed" : competing === "fail" ? "failed" : "pending", outputSummary: completed ? "original output" : null, taskId: p.firstTask.id });
      const after = await snapshot();
      expect(after.projects.find(r => r.id === projectId)!.next_task_number).toBe(before.projects.find(r => r.id === projectId)!.next_task_number + Number(completed));
      const currentTasks = after.tasks.filter(t => t.pipeline_id === p.pipeline.id);
      expect(currentTasks).toHaveLength(completed ? 2 : 1);
      const old = currentTasks.find(t => t.id === p.firstTask.id)!;
      expect(old).toMatchObject({ column: completed ? "done" : "backlog", assignee: reverse && competing === "assign" ? agentId : null, execution_run_id: null, execution_agent_id: null, execution_locked_at: null });
      expect(state.steps[0].agentId).toBe(old.assignee);
      if (completed) expect(currentTasks.find(t => t.id === state.steps[1].taskId)).toMatchObject({ project_id: projectId, pipeline_id: p.pipeline.id, pipeline_step_id: state.steps[1].id, column: "backlog", assignee: state.steps[1].agentId });
      else expect(state.steps[1].taskId).toBeNull();
      expect(after.dependencies.filter(d => d.task_id === p.firstTask.id)).toEqual(reverse && competing === "dependency" ? [expect.objectContaining({ task_id: p.firstTask.id, depends_on_id: dependency.id })] : []);
      expect(after.tasks.filter(t => t.pipeline_id !== p.pipeline.id)).toEqual(before.tasks.filter(t => t.pipeline_id !== p.pipeline.id));
      expect(after.runs).toEqual(before.runs);
    });
  }

  for (const reverse of [false, true]) {
    it(`A03 dependency add/checkout ordering, reverse=${reverse}`, async () => {
      const p = await create();
      await tasks.update(p.firstTask.id, { assignee: agentId });
      const owner = await run(p.firstTask.id);
      const dependency = await tasks.create({ projectId, title: "checkout dependency", taskType: "quick" });
      const before = await snapshot();
      const result = await orderedRace(p.pipeline.id,
        () => reverse ? lifecycle.checkout(p.firstTask.id, agentId, owner.id) : tasks.addDependency(p.firstTask.id, dependency.id),
        (_s, t, l) => reverse ? t.addDependency(p.firstTask.id, dependency.id) : l.checkout(p.firstTask.id, agentId, owner.id));
      expect(result[0].status).toBe("fulfilled");
      if (reverse) expect(result[1].status).toBe("fulfilled");
      else expect(result[1]).toMatchObject({ status: "rejected", reason: { statusCode: 409 } });
      const after = await snapshot();
      expect(after.tasks.find(t => t.id === p.firstTask.id)).toMatchObject({ column: reverse ? "in_progress" : "blocked", execution_run_id: reverse ? owner.id : null, execution_agent_id: reverse ? agentId : null });
      expect(after.dependencies.filter(d => d.task_id === p.firstTask.id)).toEqual([expect.objectContaining({ task_id: p.firstTask.id, depends_on_id: dependency.id })]);
      expect(after.projects).toEqual(before.projects);
      expect(after.pipelines).toEqual(before.pipelines);
      expect(after.steps).toEqual(before.steps);
      expect(after.runs).toEqual(before.runs);
    });
    it(`A03 dependency removal/completion ordering, reverse=${reverse}`, async () => {
      const p = await create();
      const dependency = await tasks.create({ projectId, title: "remove dependency", taskType: "quick" });
      await tasks.addDependency(p.firstTask.id, dependency.id);
      const before = await snapshot();
      const result = await orderedRace(p.pipeline.id,
        () => reverse ? tasks.removeDependency(p.firstTask.id, dependency.id) : finish(p.pipeline.id, p.steps[0].id, p.firstTask.id),
        (s, t) => reverse ? s.completeStep(p.pipeline.id, p.steps[0].id, p.firstTask.id, "original output", "original.md") : t.removeDependency(p.firstTask.id, dependency.id));
      expect(result[0].status).toBe("fulfilled");
      if (reverse) expect(result[1].status).toBe("fulfilled");
      else expect(result[1]).toMatchObject({ status: "rejected", reason: { statusCode: 409 } });
      const after = await snapshot();
      expect(after.dependencies.filter(d => d.task_id === p.firstTask.id)).toEqual(reverse ? [] : before.dependencies.filter(d => d.task_id === p.firstTask.id));
      expect(after.projects.find(r => r.id === projectId)!.next_task_number).toBe(before.projects.find(r => r.id === projectId)!.next_task_number + 1);
      const state = (await service.getWithSteps(p.pipeline.id))!;
      expect(state.pipeline).toMatchObject({ status: "running", currentStep: 2 });
      expect(state.steps[0]).toMatchObject({ status: "completed", taskId: p.firstTask.id });
      expect(after.tasks.filter(t => t.pipeline_id === p.pipeline.id)).toHaveLength(2);
      expect(after.tasks.find(t => t.id === state.steps[1].taskId)).toMatchObject({ pipeline_step_id: state.steps[1].id, pipeline_id: p.pipeline.id, project_id: projectId, column: "backlog" });
      expect(after.tasks.find(t => t.id === p.firstTask.id)).toMatchObject({ column: "done", execution_run_id: null });
    });
  }

});
