import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { projects, tasks, agents, pipelineTemplates, pipelines, pipelineSteps } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { PipelineService } from "../services/pipeline.service.js";
import { PipelineTemplateService } from "../services/pipeline-template.service.js";

describe("PipelineService", () => {
  let testDb: TestDb;
  let service: PipelineService;
  let templateService: PipelineTemplateService;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    templateService = new PipelineTemplateService(testDb.db);
    service = new PipelineService(testDb.db, templateService);

    const [project] = await testDb.db.insert(projects).values({
      name: "Pipeline Test",
      slug: "pipeline-test",
      homeDir: "/tmp/pipe",
      worktreeDir: "/tmp/pipe-wt",
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values([
      { id: "agent-a", projectId, name: "Agent A" },
      { id: "agent-b", projectId, name: "Agent B" },
    ]);
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(tasks);
    await testDb.db.delete(pipelineSteps);
    await testDb.db.delete(pipelines);
    await testDb.db.delete(pipelineTemplates);
  });

  describe("create (ad-hoc)", () => {
    it("creates pipeline with steps and first task", async () => {
      const result = await service.create({
        projectId,
        name: "Implement auth",
        steps: [
          { label: "research", agentId: "agent-a" },
          { label: "implement", agentId: "agent-b" },
        ],
      });

      expect(result.pipeline.id).toMatch(/^pipe_/);
      expect(result.pipeline.status).toBe("pending");
      expect(result.pipeline.currentStep).toBe(1);
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].status).toBe("pending");
      expect(result.steps[0].taskId).not.toBeNull();
      expect(result.steps[1].taskId).toBeNull();
    });
  });

  describe("create (from template)", () => {
    it("creates pipeline using template steps when steps not provided", async () => {
      const tpl = await templateService.create({
        projectId,
        name: "Standard Flow",
        steps: [
          { order: 1, label: "research", defaultAgentId: "agent-a", promptTemplate: "Research..." },
          { order: 2, label: "plan", promptTemplate: "Plan..." },
          { order: 3, label: "implement", defaultAgentId: "agent-b", promptTemplate: "Build..." },
        ],
      });

      const result = await service.create({
        projectId,
        name: "Auth system",
        templateId: tpl.id,
      });

      expect(result.steps).toHaveLength(3);
      expect(result.steps[0].label).toBe("research");
      expect(result.steps[0].agentId).toBe("agent-a");
      expect(result.steps[1].label).toBe("plan");
      expect(result.steps[2].label).toBe("implement");
    });
  });

  describe("completeStep", () => {
    it("marks step completed and creates task for next step", async () => {
      const { pipeline, steps } = await service.create({
        projectId,
        name: "Test transition",
        steps: [
          { label: "research", agentId: "agent-a" },
          { label: "implement", agentId: "agent-b" },
        ],
      });

      const result = await service.completeStep(
        pipeline.id,
        steps[0].id,
        "Research complete",
        ".orch8/pipelines/test/research.md",
      );

      expect(result.completedStep.status).toBe("completed");
      expect(result.completedStep.outputSummary).toBe("Research complete");
      expect(result.nextStep).not.toBeNull();
      expect(result.nextStep!.taskId).not.toBeNull();
      expect(result.pipeline.currentStep).toBe(2);
      expect(result.pipeline.status).toBe("running");
    });

    it("completes pipeline when last step finishes", async () => {
      const { pipeline, steps } = await service.create({
        projectId,
        name: "Single step",
        steps: [{ label: "do-it", agentId: "agent-a" }],
      });

      const result = await service.completeStep(
        pipeline.id,
        steps[0].id,
        "Done",
        ".orch8/pipelines/test/do-it.md",
      );

      expect(result.pipeline.status).toBe("completed");
      expect(result.nextStep).toBeNull();
    });

    it("is idempotent — second call returns existing state without creating duplicate tasks", async () => {
      const { pipeline, steps } = await service.create({
        projectId,
        name: "Idempotent test",
        steps: [
          { label: "research", agentId: "agent-a" },
          { label: "implement", agentId: "agent-b" },
        ],
      });

      const first = await service.completeStep(
        pipeline.id,
        steps[0].id,
        "Research complete",
        ".orch8/pipelines/test/research.md",
      );

      expect(first.nextStep).not.toBeNull();
      const firstNextTaskId = first.nextTask!.id;

      // Second call to completeStep for the same step
      const second = await service.completeStep(
        pipeline.id,
        steps[0].id,
        "Research complete (retry)",
        ".orch8/pipelines/test/research.md",
      );

      // Should return existing state, not create a new task
      expect(second.completedStep.status).toBe("completed");
      expect(second.nextStep).toBeNull();
      expect(second.nextTask).toBeNull();

      // Verify no duplicate tasks were created for the implement step
      const allTasks = await testDb.db.select().from(tasks);
      const implementTasks = allTasks.filter(t => t.pipelineStepId === steps[1].id);
      expect(implementTasks).toHaveLength(1);
      expect(implementTasks[0].id).toBe(firstNextTaskId);
    });

    it("skips steps marked as skipped", async () => {
      const { pipeline, steps } = await service.create({
        projectId,
        name: "With skip",
        steps: [
          { label: "research", agentId: "agent-a" },
          { label: "plan", agentId: "agent-a" },
          { label: "implement", agentId: "agent-b" },
        ],
      });

      await service.updateStep(pipeline.id, steps[1].id, { status: "skipped" });

      const result = await service.completeStep(
        pipeline.id,
        steps[0].id,
        "Research done",
        ".orch8/pipelines/test/research.md",
      );

      expect(result.nextStep!.label).toBe("implement");
      expect(result.pipeline.currentStep).toBe(3);
    });
  });

  describe("verification gate", () => {
    it("pauses at awaiting_verification when step has requiresVerification", async () => {
      const { pipeline, steps } = await service.create({
        projectId,
        name: "Verification test",
        steps: [
          { label: "plan", agentId: "agent-a", requiresVerification: true },
          { label: "implement", agentId: "agent-b" },
        ],
      });

      const result = await service.completeStep(
        pipeline.id,
        steps[0].id,
        "Plan output",
        ".orch8/pipelines/test/plan.md",
      );

      expect(result.completedStep.status).toBe("awaiting_verification");
      expect(result.completedStep.outputSummary).toBe("Plan output");
      expect(result.nextStep).toBeNull();
      expect(result.nextTask).toBeNull();
      expect(result.pipeline.currentStep).toBe(1);
      expect(result.pipeline.status).toBe("running");
    });

    it("approveStep advances pipeline to next step", async () => {
      const { pipeline, steps } = await service.create({
        projectId,
        name: "Approve test",
        steps: [
          { label: "plan", agentId: "agent-a", requiresVerification: true },
          { label: "implement", agentId: "agent-b" },
        ],
      });

      await service.completeStep(
        pipeline.id,
        steps[0].id,
        "Plan output",
        ".orch8/pipelines/test/plan.md",
      );

      const result = await service.approveStep(pipeline.id, steps[0].id);

      expect(result.approvedStep.status).toBe("completed");
      expect(result.nextStep).not.toBeNull();
      expect(result.nextStep!.label).toBe("implement");
      expect(result.nextStep!.taskId).not.toBeNull();
      expect(result.nextTask).not.toBeNull();
      expect(result.pipeline.currentStep).toBe(2);
      expect(result.pipeline.status).toBe("running");
    });

    it("approveStep completes pipeline when it is the last step", async () => {
      const { pipeline, steps } = await service.create({
        projectId,
        name: "Last step approve",
        steps: [
          { label: "review", agentId: "agent-a", requiresVerification: true },
        ],
      });

      await service.completeStep(
        pipeline.id,
        steps[0].id,
        "Review output",
        ".orch8/pipelines/test/review.md",
      );

      const result = await service.approveStep(pipeline.id, steps[0].id);

      expect(result.approvedStep.status).toBe("completed");
      expect(result.pipeline.status).toBe("completed");
      expect(result.nextStep).toBeNull();
      expect(result.nextTask).toBeNull();
    });

    it("approveStep throws if step is not awaiting_verification", async () => {
      const { pipeline, steps } = await service.create({
        projectId,
        name: "Bad approve",
        steps: [
          { label: "plan", agentId: "agent-a" },
        ],
      });

      await expect(
        service.approveStep(pipeline.id, steps[0].id),
      ).rejects.toThrow("Step is not awaiting verification");
    });
  });

  describe("failStep", () => {
    it("marks step and pipeline as failed", async () => {
      const { pipeline, steps } = await service.create({
        projectId,
        name: "Will fail",
        steps: [
          { label: "research", agentId: "agent-a" },
          { label: "implement", agentId: "agent-b" },
        ],
      });

      const result = await service.failStep(pipeline.id, steps[0].id);

      expect(result.step.status).toBe("failed");
      expect(result.pipeline.status).toBe("failed");
    });
  });

  describe("cancel", () => {
    it("cancels a running pipeline", async () => {
      const { pipeline } = await service.create({
        projectId,
        name: "Cancel me",
        steps: [
          { label: "research", agentId: "agent-a" },
          { label: "implement", agentId: "agent-b" },
        ],
      });

      const cancelled = await service.cancel(pipeline.id);
      expect(cancelled.status).toBe("cancelled");
    });
  });

  describe("getWithSteps", () => {
    it("returns pipeline with ordered steps", async () => {
      const { pipeline } = await service.create({
        projectId,
        name: "Fetch me",
        steps: [
          { label: "a", agentId: "agent-a" },
          { label: "b", agentId: "agent-b" },
        ],
      });

      const result = await service.getWithSteps(pipeline.id);
      expect(result).not.toBeNull();
      expect(result!.pipeline.name).toBe("Fetch me");
      expect(result!.steps).toHaveLength(2);
      expect(result!.steps[0].order).toBe(1);
      expect(result!.steps[1].order).toBe(2);
    });
  });

  describe("rejectStep", () => {
    it("rejects a step back to an earlier step", async () => {
      const { pipeline, steps } = await service.create({
        projectId,
        name: "Reject test",
        steps: [
          { label: "research", agentId: "agent-a" },
          { label: "implement", agentId: "agent-b" },
          { label: "review", agentId: "agent-a" },
        ],
      });

      // Complete first two steps
      await service.completeStep(
        pipeline.id,
        steps[0].id,
        "Research done",
        ".orch8/pipelines/test/research.md",
      );
      const step2Result = await service.completeStep(
        pipeline.id,
        steps[1].id,
        "Impl done",
        ".orch8/pipelines/test/implement.md",
      );
      // review step now has a task
      const reviewStep = step2Result.nextStep!;

      const result = await service.rejectStep(
        pipeline.id,
        reviewStep.id,
        steps[0].id,
        "Missing edge cases in research",
      );

      // Rejecting step is marked failed
      expect(result.rejectedStep.status).toBe("failed");
      expect(result.rejectedStep.outputSummary).toContain("[REJECTED]");

      // Target step is reset to pending with a new task
      expect(result.targetStep.status).toBe("pending");
      expect(result.newTask).not.toBeNull();
      expect(result.newTask.description).toContain("Missing edge cases in research");

      // Pipeline is running, currentStep points to target
      expect(result.pipeline.status).toBe("running");
      expect(result.pipeline.currentStep).toBe(1);

      // Intermediate step (implement) should also be reset
      const full = await service.getWithSteps(pipeline.id);
      const implStep = full!.steps.find((s) => s.label === "implement");
      expect(implStep!.status).toBe("pending");
      expect(implStep!.taskId).toBeNull();
    });

    it("rejects to the immediately previous step", async () => {
      const { pipeline, steps } = await service.create({
        projectId,
        name: "Adjacent reject",
        steps: [
          { label: "implement", agentId: "agent-a" },
          { label: "review", agentId: "agent-b" },
        ],
      });

      await service.completeStep(
        pipeline.id,
        steps[0].id,
        "Done",
        ".orch8/pipelines/test/implement.md",
      );

      const full = await service.getWithSteps(pipeline.id);
      const reviewStep = full!.steps.find((s) => s.label === "review")!;

      const result = await service.rejectStep(
        pipeline.id,
        reviewStep.id,
        steps[0].id,
        "Needs refactor",
      );

      expect(result.targetStep.status).toBe("pending");
      expect(result.pipeline.currentStep).toBe(1);
      expect(result.newTask.description).toContain("Needs refactor");
    });

    it("throws if target step is not before rejecting step", async () => {
      const { pipeline, steps } = await service.create({
        projectId,
        name: "Bad reject",
        steps: [
          { label: "research", agentId: "agent-a" },
          { label: "review", agentId: "agent-b" },
        ],
      });

      // Try to reject step[0] back to step[1] — invalid direction
      await expect(
        service.rejectStep(pipeline.id, steps[0].id, steps[1].id, "nope"),
      ).rejects.toThrow("Target step must have a lower order");
    });
  });
});
