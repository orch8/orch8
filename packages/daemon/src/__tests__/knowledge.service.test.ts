import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { projects, knowledgeEntities, knowledgeFacts } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { KnowledgeService } from "../services/knowledge.service.js";

describe("KnowledgeService", () => {
  let testDb: TestDb;
  let service: KnowledgeService;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    service = new KnowledgeService(testDb.db);

    const [project] = await testDb.db.insert(projects).values({
      name: "Knowledge Test",
      slug: "knowledge-test",
      homeDir: "/tmp/kt",
      worktreeDir: "/tmp/kt-wt",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(knowledgeFacts);
    await testDb.db.delete(knowledgeEntities);
  });

  describe("scoreFacts", () => {
    it("returns facts ordered by relevance score descending", async () => {
      const [entity] = await testDb.db.insert(knowledgeEntities).values({
        projectId,
        slug: "score-test",
        name: "Score Test",
      }).returning();

      // Fact A: recently accessed, high access count (should score highest)
      await testDb.db.insert(knowledgeFacts).values({
        entityId: entity.id,
        content: "High relevance fact",
        category: "decision",
        sourceAgent: "cto",
        accessCount: 10,
        lastAccessed: new Date(),
      });

      // Fact B: never accessed (should score lowest)
      await testDb.db.insert(knowledgeFacts).values({
        entityId: entity.id,
        content: "Low relevance fact",
        category: "observation",
        sourceAgent: "engineer",
        accessCount: 0,
        lastAccessed: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), // 100 days ago
      });

      // Fact C: moderate access
      await testDb.db.insert(knowledgeFacts).values({
        entityId: entity.id,
        content: "Medium relevance fact",
        category: "status",
        sourceAgent: "engineer",
        accessCount: 5,
        lastAccessed: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      });

      const scored = await service.scoreFacts(entity.id);

      expect(scored).toHaveLength(3);
      expect(scored[0].content).toBe("High relevance fact");
      // Verify scores are in descending order
      for (let i = 1; i < scored.length; i++) {
        expect(scored[i - 1].relevance_score).toBeGreaterThanOrEqual(scored[i].relevance_score);
      }
    });

    it("excludes superseded facts", async () => {
      const [entity] = await testDb.db.insert(knowledgeEntities).values({
        projectId,
        slug: "superseded-test",
        name: "Superseded Test",
      }).returning();

      const [activeFact] = await testDb.db.insert(knowledgeFacts).values({
        entityId: entity.id,
        content: "Current fact",
        category: "decision",
        sourceAgent: "cto",
        accessCount: 1,
        lastAccessed: new Date(),
      }).returning();

      await testDb.db.insert(knowledgeFacts).values({
        entityId: entity.id,
        content: "Old fact",
        category: "decision",
        sourceAgent: "cto",
        supersededBy: activeFact.id,
        accessCount: 5,
        lastAccessed: new Date(),
      });

      const scored = await service.scoreFacts(entity.id);
      expect(scored).toHaveLength(1);
      expect(scored[0].content).toBe("Current fact");
    });

    it("returns empty array for entity with no facts", async () => {
      const [entity] = await testDb.db.insert(knowledgeEntities).values({
        projectId,
        slug: "empty-entity",
        name: "Empty",
      }).returning();

      const scored = await service.scoreFacts(entity.id);
      expect(scored).toHaveLength(0);
    });
  });
});
