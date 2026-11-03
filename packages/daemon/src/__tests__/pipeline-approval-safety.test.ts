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
