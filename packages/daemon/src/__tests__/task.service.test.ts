import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { projects, tasks, taskDependencies } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { TaskService } from "../services/task.service.js";

describe("TaskService", () => {
  let testDb: TestDb;
  let service: TaskService;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    service = new TaskService(testDb.db);

    const [project] = await testDb.db.insert(projects).values({
      name: "Test",
      slug: "test",
      homeDir: "/tmp/test",
      worktreeDir: "/tmp/wt",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(taskDependencies);
    await testDb.db.delete(tasks);
  });

  describe("create", () => {
    it("creates a quick task in backlog", async () => {
      const task = await service.create({
        title: "Fix bug",
        projectId,
        taskType: "quick",
      });

      expect(task.id).toMatch(/^task_/);
      expect(task.taskType).toBe("quick");
      expect(task.column).toBe("backlog");
      expect(task.complexPhase).toBeNull();
      expect(task.brainstormStatus).toBeNull();
    });

    it("creates a complex task with initial research phase", async () => {
      const task = await service.create({
        title: "Auth system",
        projectId,
        taskType: "complex",
      });

      expect(task.taskType).toBe("complex");
      expect(task.complexPhase).toBe("research");
    });

    it("creates a brainstorm task with active status", async () => {
      const task = await service.create({
        title: "Explore options",
        projectId,
        taskType: "brainstorm",
      });

      expect(task.taskType).toBe("brainstorm");
      expect(task.brainstormStatus).toBe("active");
      expect(task.column).toBe("backlog");
    });

    it("creates a complex task with phase agent overrides", async () => {
      const task = await service.create({
        title: "Complex with agents",
        projectId,
        taskType: "complex",
        researchAgentId: "researcher-1",
        implementAgentId: "impl-1",
      });

      expect(task.researchAgentId).toBe("researcher-1");
      expect(task.implementAgentId).toBe("impl-1");
      expect(task.planAgentId).toBeNull();
    });
  });

  describe("getById", () => {
    it("returns a task by id", async () => {
      const created = await service.create({
        title: "Get me",
        projectId,
        taskType: "quick",
      });

      const found = await service.getById(created.id);
      expect(found).not.toBeNull();
      expect(found!.title).toBe("Get me");
    });

    it("returns null for nonexistent id", async () => {
      const found = await service.getById("task_nonexistent");
      expect(found).toBeNull();
    });
  });

  describe("list", () => {
    it("filters by project", async () => {
      await service.create({ title: "A", projectId, taskType: "quick" });
      await service.create({ title: "B", projectId, taskType: "complex" });

      const result = await service.list({ projectId });
      expect(result).toHaveLength(2);
    });

    it("filters by task type", async () => {
      await service.create({ title: "Quick", projectId, taskType: "quick" });
      await service.create({ title: "Complex", projectId, taskType: "complex" });

      const result = await service.list({ projectId, taskType: "complex" });
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Complex");
    });

    it("filters by column", async () => {
      await service.create({ title: "Backlog", projectId, taskType: "quick" });

      const result = await service.list({ projectId, column: "in_progress" });
      expect(result).toHaveLength(0);
    });
  });

  describe("update", () => {
    it("updates task fields", async () => {
      const task = await service.create({ title: "Old", projectId, taskType: "quick" });

      const updated = await service.update(task.id, { title: "New", priority: "high" });
      expect(updated.title).toBe("New");
      expect(updated.priority).toBe("high");
    });

    it("throws on nonexistent task", async () => {
      await expect(
        service.update("task_none", { title: "X" })
      ).rejects.toThrow("Task not found");
    });
  });

  describe("addDependency", () => {
    it("adds a dependency between tasks", async () => {
      const a = await service.create({ title: "A", projectId, taskType: "quick" });
      const b = await service.create({ title: "B", projectId, taskType: "quick" });

      await service.addDependency(b.id, a.id);

      const deps = await testDb.db.select().from(taskDependencies);
      expect(deps).toHaveLength(1);
      expect(deps[0].taskId).toBe(b.id);
      expect(deps[0].dependsOnId).toBe(a.id);
    });

    it("rejects self-dependency", async () => {
      const task = await service.create({ title: "Self", projectId, taskType: "quick" });

      await expect(
        service.addDependency(task.id, task.id)
      ).rejects.toThrow();
    });
  });

  describe("convertBrainstorm", () => {
    it("converts brainstorm to quick task", async () => {
      const task = await service.create({
        title: "Brainstorm",
        projectId,
        taskType: "brainstorm",
      });

      // Simulate transcript storage
      await service.update(task.id, {});
      await testDb.db.update(tasks)
        .set({ brainstormTranscript: "Some discussion...", brainstormStatus: "ready" })
        .where(sql`id = ${task.id}`);

      const converted = await service.convertBrainstorm(task.id, "quick");
      expect(converted.taskType).toBe("quick");
      expect(converted.brainstormTranscript).toBe("Some discussion...");
      expect(converted.column).toBe("backlog");
    });

    it("converts brainstorm to complex task with research phase", async () => {
      const task = await service.create({
        title: "Brainstorm",
        projectId,
        taskType: "brainstorm",
      });

      await testDb.db.update(tasks)
        .set({ brainstormStatus: "ready" })
        .where(sql`id = ${task.id}`);

      const converted = await service.convertBrainstorm(task.id, "complex");
      expect(converted.taskType).toBe("complex");
      expect(converted.complexPhase).toBe("research");
    });

    it("rejects converting non-brainstorm task", async () => {
      const task = await service.create({ title: "Quick", projectId, taskType: "quick" });

      await expect(
        service.convertBrainstorm(task.id, "complex")
      ).rejects.toThrow("Only brainstorm tasks can be converted");
    });
  });
});
