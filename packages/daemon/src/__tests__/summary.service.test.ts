import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { projects, knowledgeEntities, knowledgeFacts, agents } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { SummaryService } from "../services/summary.service.js";
import { MemoryService } from "../services/memory.service.js";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("SummaryService", () => {
  let testDb: TestDb;
  let summaryService: SummaryService;
  let memoryService: MemoryService;
  let projectId: string;
  let tmpDir: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    memoryService = new MemoryService(testDb.db);
    summaryService = new SummaryService(testDb.db, memoryService);
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "orch8-summary-"));

    const [project] = await testDb.db.insert(projects).values({
      name: "Summary Test", slug: "summary-test",
      homeDir: tmpDir,
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
    await rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await testDb.db.delete(knowledgeFacts);
    await testDb.db.delete(knowledgeEntities);
  });

  it("generates summary.md for an entity with relevant facts", async () => {
    const [entity] = await testDb.db.insert(knowledgeEntities).values({
      projectId, slug: "auth", name: "Auth System", entityType: "area",
      description: "Authentication subsystem",
    }).returning();

    await testDb.db.insert(knowledgeFacts).values([
      { entityId: entity.id, content: "Uses JWT tokens", category: "decision", sourceAgent: "eng-1", accessCount: 5 },
      { entityId: entity.id, content: "CSRF protection enabled", category: "status", sourceAgent: "eng-2", accessCount: 3 },
    ]);

    const summaryDir = path.join(tmpDir, ".orch", "memory", "summaries");
    const result = await summaryService.generateEntitySummary(entity.id, summaryDir);

    expect(result.factCount).toBe(2);
    expect(result.filePath).toContain("auth.md");

    const content = await readFile(result.filePath, "utf-8");
    expect(content).toContain("# Auth System");
    expect(content).toContain("Uses JWT tokens");
    expect(content).toContain("CSRF protection enabled");
  });

  it("excludes facts with relevance below 0.3", async () => {
    const [entity] = await testDb.db.insert(knowledgeEntities).values({
      projectId, slug: "old-facts", name: "Old Facts", entityType: "archive",
    }).returning();

    // Insert a fact with zero access and old timestamp — relevance will be low
    await testDb.db.insert(knowledgeFacts).values({
      entityId: entity.id, content: "Very old fact", category: "observation",
      sourceAgent: "eng-1", accessCount: 0,
      lastAccessed: new Date("2020-01-01"),
    });

    const summaryDir = path.join(tmpDir, ".orch", "memory", "summaries");
    const result = await summaryService.generateEntitySummary(entity.id, summaryDir);

    expect(result.factCount).toBe(0);
  });

  it("regenerates all summaries for a project", async () => {
    const [e1] = await testDb.db.insert(knowledgeEntities).values({
      projectId, slug: "entity-a", name: "Entity A", entityType: "area",
    }).returning();
    const [e2] = await testDb.db.insert(knowledgeEntities).values({
      projectId, slug: "entity-b", name: "Entity B", entityType: "area",
    }).returning();

    await testDb.db.insert(knowledgeFacts).values([
      { entityId: e1.id, content: "Fact A", category: "status", sourceAgent: "eng-1", accessCount: 5 },
      { entityId: e2.id, content: "Fact B", category: "status", sourceAgent: "eng-1", accessCount: 5 },
    ]);

    const summaryDir = path.join(tmpDir, ".orch", "memory", "summaries");
    const results = await summaryService.regenerateAllSummaries(projectId, summaryDir);

    expect(results).toHaveLength(2);
  });
});
