import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { projects, tasks, agents } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { ComplexPhaseService } from "../services/complex-phase.service.js";

describe("ComplexPhaseService", () => {
  let testDb: TestDb;
  let service: ComplexPhaseService;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    service = new ComplexPhaseService(testDb.db);

    const [project] = await testDb.db.insert(projects).values({
      name: "Phase Test",
      slug: "phase-test",
      homeDir: "/tmp/phase",
      worktreeDir: "/tmp/phase-wt",
    }).returning();
    projectId = project.id;

    // Create agents for phase resolution
    await testDb.db.insert(agents).values([
      { id: "researcher", projectId, name: "Researcher", role: "researcher" },
      { id: "planner", projectId, name: "Planner", role: "planner" },
      { id: "implementer", projectId, name: "Implementer", role: "implementer" },
      { id: "reviewer", projectId, name: "Reviewer", role: "reviewer" },
    ]);
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(tasks);
  });

  describe("completePhase", () => {
    it("advances research → plan and stores output", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Complex task",
        taskType: "complex",
        complexPhase: "research",
      }).returning();

      const result = await service.completePhase(task.id, "Research findings here");

      expect(result.task.complexPhase).toBe("plan");
      expect(result.task.researchOutput).toBe("Research findings here");
      expect(result.nextPhase).toBe("plan");
    });

    it("advances plan → implement and stores output", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Complex task",
        taskType: "complex",
        complexPhase: "plan",
        researchOutput: "Prior research",
      }).returning();

      const result = await service.completePhase(task.id, "Implementation plan");

      expect(result.task.complexPhase).toBe("implement");
      expect(result.task.planOutput).toBe("Implementation plan");
      expect(result.nextPhase).toBe("implement");
    });

    it("advances implement → review and stores output", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Complex task",
        taskType: "complex",
        complexPhase: "implement",
      }).returning();

      const result = await service.completePhase(task.id, "Implementation complete");

      expect(result.task.complexPhase).toBe("review");
      expect(result.task.implementationOutput).toBe("Implementation complete");
      expect(result.nextPhase).toBe("review");
    });

    it("completes review phase → moves to review column, null nextPhase", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Complex task",
        taskType: "complex",
        complexPhase: "review",
      }).returning();

      const result = await service.completePhase(task.id, "Review report");

      expect(result.task.reviewOutput).toBe("Review report");
      expect(result.task.column).toBe("review");
      expect(result.nextPhase).toBeNull();
    });

    it("throws for non-complex tasks", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Quick task",
        taskType: "quick",
      }).returning();

      await expect(
        service.completePhase(task.id, "Output")
      ).rejects.toThrow("not a complex task");
    });
  });

  describe("getPhaseAgent", () => {
    it("returns task-level agent override when set", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "With override",
        taskType: "complex",
        complexPhase: "research",
        researchAgentId: "researcher",
      }).returning();

      const agent = await service.getPhaseAgent(task, "research");
      expect(agent).not.toBeNull();
      expect(agent!.id).toBe("researcher");
    });

    it("returns null when no agent configured for phase", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "No override",
        taskType: "complex",
        complexPhase: "research",
      }).returning();

      const agent = await service.getPhaseAgent(task, "research");
      expect(agent).toBeNull();
    });
  });

  describe("getPhaseContext", () => {
    it("returns empty string for research phase", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Research",
        taskType: "complex",
        complexPhase: "research",
      }).returning();

      const context = service.getPhaseContext(task, "research");
      expect(context).toBe("");
    });

    it("returns research output for plan phase", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Plan",
        taskType: "complex",
        complexPhase: "plan",
        researchOutput: "Research findings",
      }).returning();

      const context = service.getPhaseContext(task, "plan");
      expect(context).toContain("Research findings");
    });

    it("returns research + plan output for implement phase", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Implement",
        taskType: "complex",
        complexPhase: "implement",
        researchOutput: "Research findings",
        planOutput: "Implementation plan",
      }).returning();

      const context = service.getPhaseContext(task, "implement");
      expect(context).toContain("Research findings");
      expect(context).toContain("Implementation plan");
    });

    it("returns all prior outputs for review phase", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Review",
        taskType: "complex",
        complexPhase: "review",
        researchOutput: "Research",
        planOutput: "Plan",
        implementationOutput: "Implementation",
      }).returning();

      const context = service.getPhaseContext(task, "review");
      expect(context).toContain("Research");
      expect(context).toContain("Plan");
      expect(context).toContain("Implementation");
    });
  });
});
