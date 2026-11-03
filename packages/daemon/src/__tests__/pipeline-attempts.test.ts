import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { makeFailingTxDb } from "./helpers/failing-tx.js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { PipelineService } from "../services/pipeline.service.js";
import { PipelineTemplateService } from "../services/pipeline-template.service.js";
import { TaskService } from "../services/task.service.js";
import { TaskLifecycleService } from "../services/task-lifecycle.service.js";
import { SchedulerService } from "../services/scheduler.service.js";
import { HeartbeatService } from "../services/heartbeat.service.js";
import { BroadcastService } from "../services/broadcast.service.js";

describe("pipeline attempt ownership", () => {
  let db: TestDb;
  let service: PipelineService;
  let projectId: string;
  beforeAll(async () => {
    db = await setupTestDb();
    service = new PipelineService(db.db, new PipelineTemplateService(db.db));
    const [project] = await db.db.insert(schema.projects).values({ name: "attempts", slug: "attempts", homeDir: "/tmp/attempts" }).returning();
    projectId = project.id;
    await db.db.insert(schema.agents).values({ id: "attempt-agent", projectId, name: "Agent" });
  }, 60000);
  afterAll(async () => teardownTestDb(db));
  const create = () => service.create({ projectId, name: "attempt", steps: [{ label: "one", agentId: "attempt-agent" }, { label: "two" }] });
  const complete = (p: string, s: string, t: string) => service.completeStep(p, s, t, "done", "done.md");

  async function snapshot(client: postgres.Sql) {
    return {
      pipelines: await client`SELECT * FROM pipelines ORDER BY id`,
      steps: await client`SELECT * FROM pipeline_steps ORDER BY id`,
      tasks: await client`SELECT * FROM tasks ORDER BY id`,
      allocator: await client`SELECT id, next_task_number FROM projects ORDER BY id`,
    };
  }
  for (const branch of ["successor", "final", "verification"] as const) {
    for (const boundary of [
      { name: "task done", failUpdateOnTable: schema.tasks },
      { name: "step", failUpdateOnTable: schema.pipelineSteps },
      { name: "pipeline", failUpdateOnTable: schema.pipelines },
      ...(branch === "successor" ? [
        { name: "allocator", failUpdateOnTable: schema.projects },
        { name: "task insert", failInsertOnTable: schema.tasks },
        { name: "backlink", failUpdateOnTable: schema.pipelineSteps, skip: 1 },
      ] : []),
    ]) {
      it(`rolls back ${branch} completion at ${boundary.name}`, async () => {
        const { pipeline, steps, firstTask } = await service.create({ projectId, name: "rollback", steps:
          branch === "successor" ? [{ label: "one" }, { label: "two" }] : [{ label: "one", requiresVerification: branch === "verification" }],
        });
        const client = postgres(db.connectionUri, { max: 1 });
        try {
          const before = await snapshot(client);
          const failing = new PipelineService(makeFailingTxDb(db.db, boundary), new PipelineTemplateService(db.db));
          await expect(failing.completeStep(pipeline.id, steps[0].id, firstTask.id, "done", "done.md")).rejects.toThrow("simulated db write failure");
          expect(await snapshot(client)).toEqual(before);
        } finally { await client.end(); }
      });
    }
  }
  for (const operation of ["fail", "retry", "reject"] as const) {
    for (const boundary of [
      { name: "pipeline", failUpdateOnTable: schema.pipelines },
      { name: "step", failUpdateOnTable: schema.pipelineSteps },
      ...(operation !== "fail" ? [
        { name: "allocator", failUpdateOnTable: schema.projects },
        { name: "task insert", failInsertOnTable: schema.tasks },
        { name: "backlink", failUpdateOnTable: schema.pipelineSteps, skip: operation === "reject" ? 2 : 1 },
      ] : []),
    ]) {
      it(`rolls back ${operation} at ${boundary.name}`, async () => {
        const { pipeline, steps, firstTask } = await create();
        if (operation === "retry") await service.failStep(pipeline.id, steps[0].id, firstTask.id);
        if (operation === "reject") await complete(pipeline.id, steps[0].id, firstTask.id);
        const client = postgres(db.connectionUri, { max: 1 });
        try {
          const before = await snapshot(client);
          const failing = new PipelineService(makeFailingTxDb(db.db, boundary), new PipelineTemplateService(db.db));
          const action = operation === "retry" ? failing.retry(pipeline.id) : operation === "reject"
            ? failing.rejectStep(pipeline.id, steps[1].id, steps[0].id, "redo") : failing.failStep(pipeline.id, steps[0].id, firstTask.id);
          await expect(action).rejects.toThrow("simulated db write failure");
          expect(await snapshot(client)).toEqual(before);
        } finally { await client.end(); }
      });
    }
  }
  it("unblocks current pipeline tasks when dependencies finish", async () => {
    const { firstTask } = await create();
    const tasks = new TaskService(db.db);
    const dependency = await tasks.create({ projectId, title: "dependency", taskType: "quick" });
    await tasks.addDependency(firstTask.id, dependency.id);
    await tasks.update(dependency.id, { column: "done" });
    await tasks.unblockResolved(projectId);
    expect((await tasks.getById(firstTask.id))?.column).toBe("backlog");
  });
  it("requires exact run ownership for checkout and public release", async () => {
    const { firstTask } = await create();
    const lifecycle = new TaskLifecycleService(db.db, new TaskService(db.db));
    const runs = await db.db.insert(schema.heartbeatRuns).values([0, 1].map(() => ({ projectId, taskId: firstTask.id, agentId: "attempt-agent", status: "running" as const, invocationSource: "on_demand" as const }))).returning();
    await lifecycle.checkout(firstTask.id, "attempt-agent", runs[0].id);
    await lifecycle.checkout(firstTask.id, "attempt-agent", runs[0].id);
    await expect(lifecycle.checkout(firstTask.id, "attempt-agent", runs[1].id)).rejects.toThrow();
    await expect(lifecycle.release(firstTask.id, "attempt-agent", runs[1].id)).rejects.toThrow();
    await expect(lifecycle.release(firstTask.id, "attempt-agent")).rejects.toThrow();
    expect((await new TaskService(db.db).getById(firstTask.id))?.executionRunId).toBe(runs[0].id);
    await lifecycle.release(firstTask.id, "attempt-agent", runs[0].id);
  });
  it("assigns step and task together and refuses foreign task identities", async () => {
    const { pipeline, steps, firstTask } = await create();
    const other = await create();
    const client = postgres(db.connectionUri, { max: 1 });
    try {
      const before = await snapshot(client);
      await expect(complete(pipeline.id, steps[0].id, other.firstTask.id)).rejects.toThrow();
      expect(await snapshot(client)).toEqual(before);
      await service.updateStep(pipeline.id, steps[0].id, { agentId: null });
      expect((await new TaskService(db.db).getById(firstTask.id))?.assignee).toBeNull();
      await new TaskService(db.db).update(firstTask.id, { assignee: "attempt-agent" });
      expect((await service.getWithSteps(pipeline.id))?.steps[0].agentId).toBe("attempt-agent");
    } finally { await client.end(); }
  });
  for (const competing of ["complete", "cancel", "fail", "assign"] as const) {
    it(`orders ${competing} against completion with a database lock barrier`, async () => {
      const { pipeline, steps, firstTask } = await create();
      const client = postgres(db.connectionUri, { max: 1 });
      const blocker = postgres(db.connectionUri, { max: 1 });
      const otherDb = drizzle(client, { schema });
      const other = new PipelineService(otherDb, new PipelineTemplateService(otherDb));
      let results!: Promise<PromiseSettledResult<unknown>[]>;
      try {
        await blocker.begin(async raw => {
          const tx = raw as unknown as postgres.Sql;
          await tx`SELECT id FROM pipelines WHERE id = ${pipeline.id} FOR UPDATE`;
          const [{ pid }] = await tx`SELECT pg_backend_pid() AS pid`;
          const first = complete(pipeline.id, steps[0].id, firstTask.id);
          const second = competing === "complete" ? other.completeStep(pipeline.id, steps[0].id, firstTask.id, "done", "done.md")
            : competing === "cancel" ? other.cancel(pipeline.id)
            : competing === "fail" ? other.failStep(pipeline.id, steps[0].id, firstTask.id)
            : other.updateStep(pipeline.id, steps[0].id, { agentId: null });
          results = Promise.allSettled([first, second]);
          const deadline = Date.now() + 5000;
          while (true) {
            const waiting = await db.sql`WITH RECURSIVE waiters AS (
              SELECT pid FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))
              UNION
              SELECT a.pid FROM pg_stat_activity a JOIN waiters w ON w.pid = ANY(pg_blocking_pids(a.pid))
            ) SELECT pid FROM waiters`;
            if (waiting.length === 2) break;
            if (Date.now() > deadline) throw new Error(JSON.stringify(await db.sql`SELECT pid, query, wait_event_type, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datname = current_database()`));
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        });
        const settled = await results;
        expect(settled.some(r => r.status === "fulfilled")).toBe(true);
        if (competing === "complete") expect(settled.every(r => r.status === "fulfilled")).toBe(true);
        const state = (await service.getWithSteps(pipeline.id))!;
        const persisted = await blocker`SELECT id FROM tasks WHERE pipeline_id = ${pipeline.id}`;
        expect(persisted.length).toBe(state.steps[0].status === "completed" ? 2 : 1);
        if (state.steps[0].status === "completed") expect(state.steps[1].taskId).toBeTruthy();
        if (competing === "cancel") expect(state.pipeline.status).toBe("cancelled");
      } finally { await client.end(); await blocker.end(); }
    });
  }
  for (const operation of ["approve", "reject", "retry"] as const) {
    it(`refuses inconsistent current task identity during ${operation}`, async () => {
      const { pipeline, steps, firstTask } = await service.create({ projectId, name: "identity", steps: [{ label: "one" }, { label: "two", requiresVerification: true }] });
      let currentTask = firstTask.id;
      if (operation !== "retry") {
        const next = await complete(pipeline.id, steps[0].id, firstTask.id);
        currentTask = next.nextTask!.id;
        await complete(pipeline.id, steps[1].id, currentTask);
      } else await service.failStep(pipeline.id, steps[0].id, currentTask);
      const client = postgres(db.connectionUri, { max: 1 });
      try {
        await client`UPDATE tasks SET pipeline_step_id = 'foreign-step' WHERE id = ${currentTask}`;
        const before = await snapshot(client);
        const action = operation === "approve" ? service.approveStep(pipeline.id, steps[1].id)
          : operation === "reject" ? service.rejectStep(pipeline.id, steps[1].id, steps[0].id, "redo") : service.retry(pipeline.id);
        await expect(action).rejects.toThrow();
        expect(await snapshot(client)).toEqual(before);
      } finally { await client.end(); }
    });
  }
  it("serializes active pipeline blocking and requires the run owner before clearing its lock", async () => {
    const { firstTask } = await create();
    const lifecycle = new TaskLifecycleService(db.db, new TaskService(db.db));
    expect((await lifecycle.transition(firstTask.id, "blocked")).column).toBe("blocked");
    expect((await lifecycle.transition(firstTask.id, "backlog")).column).toBe("backlog");
    const [run] = await db.db.insert(schema.heartbeatRuns).values({ projectId, taskId: firstTask.id, agentId: "attempt-agent", status: "running", invocationSource: "on_demand" }).returning();
    await lifecycle.checkout(firstTask.id, "attempt-agent", run.id);
    await expect(lifecycle.transition(firstTask.id, "blocked", { agentId: "attempt-agent", runId: "stale" })).rejects.toThrow();
    expect((await new TaskService(db.db).getById(firstTask.id))?.executionRunId).toBe(run.id);
    const blocked = await lifecycle.transition(firstTask.id, "blocked", { agentId: "attempt-agent", runId: run.id });
    expect(blocked.column).toBe("blocked");
    expect(blocked.executionRunId).toBeNull();
  });
  it("does not automatically reopen a manually blocked pipeline task without dependencies", async () => {
    const { firstTask } = await create();
    const tasks = new TaskService(db.db);
    await new TaskLifecycleService(db.db, tasks).transition(firstTask.id, "blocked");
    await tasks.unblockResolved(projectId);
    expect((await tasks.getById(firstTask.id))?.column).toBe("blocked");
  });
  it("rejects a superseded completion without mutating replacement", async () => {
    const { pipeline, steps, firstTask } = await create();
    await service.failStep(pipeline.id, steps[0].id, firstTask.id);
    const replacement = await service.retry(pipeline.id);
    await expect(complete(pipeline.id, steps[0].id, firstTask.id)).rejects.toThrow();
    expect((await service.getWithSteps(pipeline.id))?.steps[0].taskId).toBe(replacement.nextTask?.id);
    expect((await service.getWithSteps(pipeline.id))?.steps[0].status).toBe("pending");
  });
  it("rejects generic completion and unknown run checkout", async () => {
    const { firstTask } = await create();
    const lifecycle = new TaskLifecycleService(db.db, new TaskService(db.db));
    await expect(lifecycle.checkout(firstTask.id, "attempt-agent", "unknown")).rejects.toThrow();
    await expect(lifecycle.transition(firstTask.id, "done")).rejects.toThrow();
  });
  it("rejects task service column bypass", async () => {
    const { firstTask } = await create();
    await expect(new TaskService(db.db).update(firstTask.id, { column: "done" })).rejects.toThrow();
  });
  it("serializes duplicate completions on independent connections", async () => {
    const { pipeline, steps, firstTask } = await create();
    const client = postgres(db.connectionUri, { max: 1 });
    try {
      const otherDb = drizzle(client, { schema });
      const other = new PipelineService(otherDb, new PipelineTemplateService(otherDb));
      const results = await Promise.all([complete(pipeline.id, steps[0].id, firstTask.id), other.completeStep(pipeline.id, steps[0].id, firstTask.id, "done", "done.md")]);
      expect(results.filter(r => r.nextTask)).toHaveLength(1);
      expect(await client`SELECT id FROM tasks WHERE pipeline_id = ${pipeline.id}`).toHaveLength(2);
      expect((await client`SELECT "column" FROM tasks WHERE id = ${firstTask.id}`)[0].column).toBe("done");
    } finally { await client.end(); }
  });
  for (const caller of ["finalizer", "reaper"] as const) {
  it(`stale ${caller} cleanup cannot erase a newer checkout or promote a wake`, async () => {
    const { pipeline, firstTask } = await create();
    const [oldRun, newRun] = await db.db.insert(schema.heartbeatRuns).values([0, 1].map(() => ({ projectId, taskId: firstTask.id, agentId: "attempt-agent", status: "running" as const, invocationSource: "on_demand" as const }))).returning();
    const client = postgres(db.connectionUri, { max: 1 });
    await client`UPDATE heartbeat_runs SET process_loss_retry_count = 1 WHERE id = ${oldRun.id}`;
    const heartbeat = new HeartbeatService(db.db, new BroadcastService(new Set()));
    vi.spyOn(heartbeat, "isRunActive").mockImplementation(id => id !== oldRun.id);
    const scheduler = new SchedulerService(db.db, heartbeat, { intervalMs: 60000, stalenessThresholdMs: 60000 });
    const enqueue = vi.spyOn(heartbeat, "enqueueWakeup");
    await db.db.insert(schema.wakeupRequests).values({ projectId, taskId: firstTask.id, agentId: "attempt-agent", source: "automation", status: "deferred_issue_execution" });
    try {
      let cleanup!: Promise<void>;
      await client.begin(async rawTx => {
        const tx = rawTx as unknown as postgres.Sql;
        await tx`SELECT id FROM pipelines WHERE id = ${pipeline.id} FOR UPDATE`;
        const [{ pid }] = await tx`SELECT pg_backend_pid() AS pid`;
        await tx`UPDATE tasks SET execution_run_id = ${newRun.id}, execution_agent_id = 'attempt-agent' WHERE id = ${firstTask.id}`;
        cleanup = caller === "finalizer" ? heartbeat.releaseTaskLock(firstTask.id, oldRun.id) : scheduler.reapOrphanedRuns().then(() => undefined);
        const deadline = Date.now() + 5000;
        while (true) {
          const blocked = await db.sql`SELECT pid FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))`;
          if (blocked.length) break;
          if (Date.now() > deadline) throw new Error("cleanup did not wait for pipeline lock");
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      });
      await cleanup;
      expect((await client`SELECT execution_run_id FROM tasks WHERE id = ${firstTask.id}`)[0].execution_run_id).toBe(newRun.id);
      expect(enqueue).not.toHaveBeenCalled();
      await heartbeat.releaseTaskLock(firstTask.id, newRun.id);
      expect((await client`SELECT execution_run_id FROM tasks WHERE id = ${firstTask.id}`)[0].execution_run_id).toBeNull();
    } finally { enqueue.mockRestore(); await client.end(); }
  });
  }
});
