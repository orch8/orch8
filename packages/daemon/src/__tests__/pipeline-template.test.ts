import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { projects, pipelineTemplates } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { PipelineTemplateService } from "../services/pipeline-template.service.js";

describe("PipelineTemplateService", () => {
  let testDb: TestDb;
  let service: PipelineTemplateService;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    service = new PipelineTemplateService(testDb.db);

    const [project] = await testDb.db.insert(projects).values({
      name: "Pipeline Template Test",
      slug: "pipeline-tpl-test",
      homeDir: "/tmp/ptpl",
      worktreeDir: "/tmp/ptpl-wt",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(pipelineTemplates);
  });

  describe("create", () => {
    it("creates a template with steps", async () => {
      const tpl = await service.create({
        projectId,
        name: "Dev Flow",
        description: "Standard flow",
        steps: [
          { order: 1, label: "research", promptTemplate: "Research..." },
          { order: 2, label: "implement", promptTemplate: "Build..." },
        ],
      });

      expect(tpl.id).toMatch(/^ptpl_/);
      expect(tpl.name).toBe("Dev Flow");
      expect(tpl.steps).toHaveLength(2);
      expect((tpl.steps as Array<{ label: string }>)[0].label).toBe("research");
    });
  });

  describe("list", () => {
    it("returns templates for a project", async () => {
      await service.create({ projectId, name: "A", steps: [{ order: 1, label: "a" }] });
      await service.create({ projectId, name: "B", steps: [{ order: 1, label: "b" }] });

      const list = await service.list({ projectId });
      expect(list).toHaveLength(2);
    });
  });

  describe("getById", () => {
    it("returns a template by ID", async () => {
      const created = await service.create({ projectId, name: "Find Me", steps: [{ order: 1, label: "x" }] });
      const found = await service.getById(created.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe("Find Me");
    });

    it("returns null for unknown ID", async () => {
      const found = await service.getById("ptpl_nonexistent");
      expect(found).toBeNull();
    });
  });

  describe("update", () => {
    it("updates name and steps", async () => {
      const created = await service.create({ projectId, name: "Old", steps: [{ order: 1, label: "old" }] });
      const updated = await service.update(created.id, {
        name: "New",
        steps: [{ order: 1, label: "new" }, { order: 2, label: "newer" }],
      });

      expect(updated.name).toBe("New");
      expect(updated.steps).toHaveLength(2);
    });
  });

  describe("delete", () => {
    it("deletes a template", async () => {
      const created = await service.create({ projectId, name: "Delete Me", steps: [{ order: 1, label: "x" }] });
      await service.delete(created.id);
      const found = await service.getById(created.id);
      expect(found).toBeNull();
    });
  });
});
