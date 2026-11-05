import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { agents, pipelines, pipelineSteps, projects, tasks } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { makeFailingTxDb } from "./helpers/failing-tx.js";
import { PipelineService } from "../services/pipeline.service.js";
import { PipelineTemplateService } from "../services/pipeline-template.service.js";
import { buildServer } from "../server.js";
import { globalConfigSchema } from "../config/schema.js";
import { hashAgentToken } from "../api/middleware/agent-token.js";

describe("pipeline approval safety", () => {
  let testDb: TestDb;
  let service: PipelineService;
  let app: ReturnType<typeof buildServer>;
  let projectId: string;
  const agentToken = "approval-test-agent-token";

  beforeAll(async () => {
    testDb = await setupTestDb();
    service = new PipelineService(testDb.db, new PipelineTemplateService(testDb.db));
    app = buildServer({
      databaseUrl: testDb.connectionUri,
      config: globalConfigSchema.parse({ auth: { allow_localhost_admin: true } }),
    });
    await app.ready();
    const [project] = await testDb.db.insert(projects).values({
      name: "Approval safety", slug: "approval-safety", homeDir: "/tmp/approval-safety",
    }).returning();
    projectId = project.id;
    await testDb.db.insert(agents).values({
      id: "approval-agent", projectId, name: "Approval agent", agentTokenHash: hashAgentToken(agentToken),
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await testDb.db.delete(tasks);
    await testDb.db.delete(pipelineSteps);
    await testDb.db.delete(pipelines);
  });

  async function waitingPlan() {
    const p = await service.create({ projectId, name: "Plan revision", steps: [
      { label: "Plan", requiresVerification: true }, { label: "Implement" },
    ] });
    await service.completeStep(p.pipeline.id, p.steps[0].id, p.firstTask.id, "Original plan", p.steps[0].outputFilePath!);
    return p;
  }

  it("revises only Plan with feedback and preserves prior task and artifact reference", async () => {
    const p = await waitingPlan();
    const result = await service.requestPlanChanges(p.pipeline.id, p.steps[0].id, "Add migration details");
    expect(result.pipeline.currentStep).toBe(1);
    expect(result.step.status).toBe("pending");
    expect(result.step.requiresVerification).toBe(true);
    expect(result.step.outputFilePath).not.toBe(p.steps[0].outputFilePath);
    expect(result.newTask.description).toContain("Add migration details");
    expect(result.newTask.description).toContain(p.steps[0].outputFilePath);
    expect(result.newTask.description).toContain(p.firstTask.id);
    const all = await testDb.db.select().from(tasks);
    expect(all).toHaveLength(2);
    expect(all.find(t => t.id === p.firstTask.id)).toBeDefined();
    expect((await service.getWithSteps(p.pipeline.id))!.steps[1].taskId).toBeNull();
    await expect(service.requestPlanChanges(p.pipeline.id, p.steps[0].id, "again")).rejects.toThrow("not awaiting verification");
  });

  it("exposes exact pipeline-linked artifact paths after two Plan revisions", async () => {
    const p = await waitingPlan();
    const first = await service.requestPlanChanges(p.pipeline.id, p.steps[0].id, "first revision");
    await service.completeStep(p.pipeline.id, first.step.id, first.newTask.id, "First revision", first.step.outputFilePath!);
    const second = await service.requestPlanChanges(p.pipeline.id, first.step.id, "second revision");
    await service.completeStep(p.pipeline.id, second.step.id, second.newTask.id, "Second revision", second.step.outputFilePath!);
    const other = await waitingPlan();
    const paths = await service.getPublicationOutputPaths(p.pipeline.id);
    expect(paths).toEqual(expect.arrayContaining([
      p.steps[0].outputFilePath, first.step.outputFilePath, second.step.outputFilePath,
    ]));
    expect(paths).not.toContain(`.orch8/pipelines/${p.pipeline.id}/Plan-${p.firstTask.id}.md`);
    expect(paths).not.toContain(other.steps[0].outputFilePath);
    expect(paths).not.toContain(`.orch8/pipelines/${p.pipeline.id}/Plan-${other.firstTask.id}.md`);
    expect(paths).not.toContain(`.orch8/pipelines/${p.pipeline.id}/unrelated.md`);
    expect(await service.getPlanAttempts(p.pipeline.id)).toEqual([
      { taskId: p.firstTask.id, path: p.steps[0].outputFilePath },
      { taskId: first.newTask.id, path: first.step.outputFilePath },
      { taskId: second.newTask.id, path: second.step.outputFilePath },
    ]);
    const response = await app.inject({ method: "GET", url: `/api/pipelines/${p.pipeline.id}/diff` });
    expect(response.json().publicationOutputPaths).toEqual(paths);
  });

  it("keeps the original artifact path when Plan uses different casing", async () => {
    const p = await service.create({ projectId, name: "Lowercase plan", steps: [
      { label: "plan", requiresVerification: true }, { label: "Implement" },
    ] });
    await service.completeStep(p.pipeline.id, p.steps[0].id, p.firstTask.id, "Original", p.steps[0].outputFilePath!);
    await service.requestPlanChanges(p.pipeline.id, p.steps[0].id, "clarify");
    expect(await service.getPublicationOutputPaths(p.pipeline.id)).toContain(p.steps[0].outputFilePath);
  });

  it("gives retried and rejected Plan tasks their own history artifacts", async () => {
    const retry = await service.create({ projectId, name: "Retry plan", steps: [
      { label: "Plan", requiresVerification: true }, { label: "Implement" },
    ] });
    await testDb.db.update(pipelineSteps).set({ status: "failed" }).where(eq(pipelineSteps.id, retry.steps[0].id));
    await testDb.db.update(pipelines).set({ status: "failed" }).where(eq(pipelines.id, retry.pipeline.id));
    const retried = await service.retry(retry.pipeline.id);
    expect(retried.nextStep!.outputFilePath).toBe(`.orch8/pipelines/${retry.pipeline.id}/Plan-${retried.nextTask!.id}.md`);
    expect(await service.getPlanAttempts(retry.pipeline.id)).toEqual([
      { taskId: retry.firstTask.id, path: retry.steps[0].outputFilePath },
      { taskId: retried.nextTask!.id, path: retried.nextStep!.outputFilePath },
    ]);

    const rejected = await waitingPlan();
    await service.approveStep(rejected.pipeline.id, rejected.steps[0].id);
    const implementation = (await service.getWithSteps(rejected.pipeline.id))!.steps[1];
    const result = await service.rejectStep(rejected.pipeline.id, implementation.id, rejected.steps[0].id, "Reconsider scope");
    expect(result.targetStep.outputFilePath).toBe(`.orch8/pipelines/${rejected.pipeline.id}/Plan-${result.newTask.id}.md`);
    expect(await service.getPlanAttempts(rejected.pipeline.id)).toEqual([
      { taskId: rejected.firstTask.id, path: rejected.steps[0].outputFilePath },
      { taskId: result.newTask.id, path: result.targetStep.outputFilePath },
    ]);
  });

  it("requires a current active Plan gate and nonempty feedback", async () => {
    const p = await waitingPlan();
    for (const feedback of [" ", "x".repeat(10001)]) {
      await expect(service.requestPlanChanges(p.pipeline.id, p.steps[0].id, feedback)).rejects.toThrow("Feedback");
    }
    await testDb.db.update(pipelineSteps).set({ label: "Review" }).where(eq(pipelineSteps.id, p.steps[0].id));
    await expect(service.requestPlanChanges(p.pipeline.id, p.steps[0].id, "revise")).rejects.toThrow("not awaiting verification");
    await testDb.db.update(pipelineSteps).set({ label: "Plan" }).where(eq(pipelineSteps.id, p.steps[0].id));
    await service.cancel(p.pipeline.id);
    await expect(service.requestPlanChanges(p.pipeline.id, p.steps[0].id, "revise")).rejects.toThrow("not awaiting verification");
  });

  it("serializes duplicate revision requests and gates the regenerated plan", async () => {
    const p = await waitingPlan();
    const results = await Promise.allSettled([
      service.requestPlanChanges(p.pipeline.id, p.steps[0].id, "first"),
      service.requestPlanChanges(p.pipeline.id, p.steps[0].id, "second"),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const current = (await service.getWithSteps(p.pipeline.id))!.steps[0];
    await service.completeStep(p.pipeline.id, current.id, current.taskId!, "Revised plan", current.outputFilePath!);
    const updated = (await service.getWithSteps(p.pipeline.id))!;
    expect(updated.pipeline.currentStep).toBe(1);
    expect(updated.steps[0].status).toBe("awaiting_verification");
    expect(updated.steps[1].taskId).toBeNull();
    expect(await testDb.db.select().from(tasks)).toHaveLength(2);
  });

  it("rolls back plan revision if creating a task fails", async () => {
    const p = await waitingPlan();
    const before = await snapshot();
    const failing = new PipelineService(makeFailingTxDb(testDb.db, { failInsertOnTable: tasks }), new PipelineTemplateService(testDb.db));
    await expect(failing.requestPlanChanges(p.pipeline.id, p.steps[0].id, "revise")).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });

  it("validates feedback and denies agents at the plan revision API", async () => {
    const p = await waitingPlan();
    const url = `/api/pipelines/${p.pipeline.id}/steps/${p.steps[0].id}/request-plan-changes`;
    const before = await snapshot();
    expect((await app.inject({ method: "POST", url, payload: { feedback: " " } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url, headers: { authorization: `Bearer ${agentToken}` }, payload: { feedback: "revise" } })).statusCode).toBe(403);
    expect(await snapshot()).toEqual(before);
    expect((await app.inject({ method: "POST", url, payload: { feedback: "revise" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url, payload: { feedback: "again" } })).statusCode).toBe(409);
  });

  async function waiting() {
    const result = await service.create({ projectId, name: "Gate", steps: [
      { label: "work" }, { label: "review", requiresVerification: true }, { label: "ship" },
    ] });
    await service.completeStep(result.pipeline.id, result.steps[0].id, (await service.getWithSteps(result.pipeline.id))!.steps.find(s => s.id === result.steps[0].id)!.taskId!, "work", "work.md");
    await service.completeStep(result.pipeline.id, result.steps[1].id, (await service.getWithSteps(result.pipeline.id))!.steps.find(s => s.id === result.steps[1].id)!.taskId!, "review", "review.md");
    return result;
  }

  async function snapshot() {
    return {
      pipelines: await testDb.db.select().from(pipelines).orderBy(pipelines.id),
      steps: await testDb.db.select().from(pipelineSteps).orderBy(pipelineSteps.id),
      tasks: await testDb.db.select().from(tasks).orderBy(tasks.id),
      allocation: await testDb.db.select({ nextTaskNumber: projects.nextTaskNumber })
        .from(projects).where(eq(projects.id, projectId)),
    };
  }

  for (const decision of ["approve", "reject"] as const) {
    it(`denies agent ${decision} without writes or wakeups`, async () => {
      const { pipeline, steps } = await waiting();
      const before = await snapshot();
      const wake = vi.spyOn(app.heartbeatService, "enqueueWakeup");
      const response = await app.inject({
        method: "POST", url: `/api/pipelines/${pipeline.id}/steps/${steps[1].id}/${decision}`,
        headers: { authorization: `Bearer ${agentToken}` },
        ...(decision === "reject" ? { payload: { targetStepId: steps[0].id, feedback: "revise" } } : {}),
      });
      expect(response.statusCode).toBe(403);
      expect(await snapshot()).toEqual(before);
      expect(wake).not.toHaveBeenCalled();
    });

    it(`denies unauthenticated ${decision}`, async () => {
      const response = await app.inject({
        method: "POST", url: `/api/pipelines/missing/steps/missing/${decision}`, remoteAddress: "192.0.2.1",
      });
      expect(response.statusCode).toBe(401);
    });

    for (const status of ["completed", "failed", "cancelled"] as const) {
      it(`refuses ${decision} on ${status} pipeline`, async () => {
        const { pipeline, steps } = await waiting();
        await testDb.db.update(pipelines).set({ status }).where(eq(pipelines.id, pipeline.id));
        const before = await snapshot();
        const action = decision === "approve"
          ? service.approveStep(pipeline.id, steps[1].id)
          : service.rejectStep(pipeline.id, steps[1].id, steps[0].id, "revise");
        await expect(action).rejects.toThrow("Pipeline is not active");
        expect(await snapshot()).toEqual(before);
        const response = await app.inject({
          method: "POST", url: `/api/pipelines/${pipeline.id}/steps/${steps[1].id}/${decision}`,
          ...(decision === "reject" ? { payload: { targetStepId: steps[0].id, feedback: "revise" } } : {}),
        });
        expect(response.statusCode).toBe(409);
        expect(await snapshot()).toEqual(before);
      });
    }
  }

  for (const decision of ["approve", "reject"] as const) {
    it(`refuses ${decision} of a stale non-current gate`, async () => {
      const { pipeline, steps } = await waiting();
      await testDb.db.update(pipelines).set({ currentStep: 1 }).where(eq(pipelines.id, pipeline.id));
      const before = await snapshot();
      const action = decision === "approve"
        ? service.approveStep(pipeline.id, steps[1].id)
        : service.rejectStep(pipeline.id, steps[1].id, steps[0].id, "revise");
      await expect(action).rejects.toThrow("Step is not current");
      expect(await snapshot()).toEqual(before);
    });
  }

  for (const status of ["completed", "failed", "skipped"] as const) {
    it(`refuses rejection of a ${status} step`, async () => {
      const { pipeline, steps } = await waiting();
      await testDb.db.update(pipelineSteps).set({ status }).where(eq(pipelineSteps.id, steps[1].id));
      const before = await snapshot();
      await expect(service.rejectStep(pipeline.id, steps[1].id, steps[0].id, "revise"))
        .rejects.toThrow("Step cannot be rejected");
      const response = await app.inject({
        method: "POST", url: `/api/pipelines/${pipeline.id}/steps/${steps[1].id}/reject`,
        payload: { targetStepId: steps[0].id, feedback: "revise" },
      });
      expect(response.statusCode).toBe(409);
      expect(await snapshot()).toEqual(before);
    });
  }

  it("concurrent approve and reject accept only one decision", async () => {
    const { pipeline, steps } = await waiting();
    const results = await Promise.allSettled([
      service.approveStep(pipeline.id, steps[1].id),
      service.rejectStep(pipeline.id, steps[1].id, steps[0].id, "revise"),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await testDb.db.select().from(tasks)).toHaveLength(3);
  });

  it("refuses foreign approval step without mutations", async () => {
    const first = await waiting();
    const second = await waiting();
    const before = await snapshot();
    await expect(service.approveStep(first.pipeline.id, second.steps[1].id)).rejects.toThrow("not found");
    expect(await snapshot()).toEqual(before);
  });

  it("refuses missing approval pipeline without mutations", async () => {
    const { steps } = await waiting();
    const before = await snapshot();
    await expect(service.approveStep("pipe_missing", steps[1].id)).rejects.toThrow("Pipeline not found");
    expect(await snapshot()).toEqual(before);
  });

  it("refuses foreign rejection source and target without mutations", async () => {
    const first = await waiting();
    const second = await waiting();
    const before = await snapshot();
    await expect(service.rejectStep(first.pipeline.id, second.steps[1].id, first.steps[0].id, "revise"))
      .rejects.toThrow("not found");
    await expect(service.rejectStep(first.pipeline.id, first.steps[1].id, second.steps[0].id, "revise"))
      .rejects.toThrow("not found");
    expect(await snapshot()).toEqual(before);
  });

  it("concurrent approvals create exactly one successor and replay does not dispatch", async () => {
    const { pipeline, steps } = await waiting();
    await testDb.db.update(pipelineSteps).set({ agentId: "approval-agent" }).where(eq(pipelineSteps.id, steps[2].id));
    const wake = vi.spyOn(app.heartbeatService, "enqueueWakeup").mockResolvedValue({
      id: "wake_test", agentId: "approval-agent", projectId, taskId: null,
      source: "automation", status: "queued", createdAt: new Date(),
      triggerDetail: null, reason: null, commentId: null, payload: null,
      coalescedCount: 0, idempotencyKey: null, requestedByActorType: null,
      requestedByActorId: null, runId: null,
    });
    const decide = () => app.inject({ method: "POST", url: `/api/pipelines/${pipeline.id}/steps/${steps[1].id}/approve` });
    const responses = await Promise.all(Array.from({ length: 8 }, decide));
    expect(responses.filter(r => r.statusCode === 200)).toHaveLength(1);
    expect(responses.filter(r => r.statusCode === 409)).toHaveLength(7);
    const successorTasks = await testDb.db.select().from(tasks).where(eq(tasks.pipelineStepId, steps[2].id));
    expect(successorTasks).toHaveLength(1);
    const state = await service.getWithSteps(pipeline.id);
    expect(state!.steps[2].taskId).toBe(successorTasks[0].id);
    expect((await decide()).statusCode).toBe(409);
    expect(wake).toHaveBeenCalledTimes(1);
  });

  for (const failure of [
    { name: "pipeline update", failUpdateOnTable: pipelines },
    { name: "successor insert", failInsertOnTable: tasks },
    { name: "successor backlink", failUpdateOnTable: pipelineSteps, skip: 1 },
  ]) {
    it(`rolls back approval on failed ${failure.name}`, async () => {
      const { pipeline, steps } = await waiting();
      const before = await snapshot();
      const failing = new PipelineService(makeFailingTxDb(testDb.db, failure), new PipelineTemplateService(testDb.db));
      await expect(failing.approveStep(pipeline.id, steps[1].id)).rejects.toThrow("simulated db write failure");
      expect(await snapshot()).toEqual(before);
      const result = await service.approveStep(pipeline.id, steps[1].id);
      expect(result.nextTask).not.toBeNull();
    });
  }

  it("rolls back last-step approval if final pipeline update fails", async () => {
    const { pipeline, steps } = await service.create({ projectId, name: "Last", steps: [{ label: "review", requiresVerification: true }] });
    await service.completeStep(pipeline.id, steps[0].id, (await service.getWithSteps(pipeline.id))!.steps.find(s => s.id === steps[0].id)!.taskId!, "done", "review.md");
    const before = await snapshot();
    const failing = new PipelineService(makeFailingTxDb(testDb.db, { failUpdateOnTable: pipelines }), new PipelineTemplateService(testDb.db));
    await expect(failing.approveStep(pipeline.id, steps[0].id)).rejects.toThrow("simulated db write failure");
    expect(await snapshot()).toEqual(before);
  });

  it("admin rejection preserves response shape", async () => {
    const { pipeline, steps } = await waiting();
    const response = await app.inject({
      method: "POST", url: `/api/pipelines/${pipeline.id}/steps/${steps[1].id}/reject`,
      payload: { targetStepId: steps[0].id, feedback: "revise" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ pipeline: { currentStep: 1 }, rejectedStep: { status: "failed" }, targetStep: { id: steps[0].id }, newTask: { pipelineStepId: steps[0].id } });
  });
});
