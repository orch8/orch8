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
});
