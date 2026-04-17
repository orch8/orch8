import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { projects, agents, knowledgeEntities, knowledgeFacts } from "@orch/shared/db";
import { eq } from "drizzle-orm";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { MemoryExtractionService } from "../services/memory-extraction.service.js";
import { MemoryService } from "../services/memory.service.js";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("MemoryExtractionService", () => {
  let testDb: TestDb;
  let extractionService: MemoryExtractionService;
  let memoryService: MemoryService;
  let projectId: string;
  let tmpDir: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    memoryService = new MemoryService(testDb.db);
    extractionService = new MemoryExtractionService(testDb.db, memoryService);
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "orch8-extract-"));

    const [project] = await testDb.db.insert(projects).values({
      name: "Extract Test", slug: "extract-test",
      homeDir: tmpDir,
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values({
      id: "eng-1", projectId, name: "Engineer", role: "engineer",
      workLogDir: path.join(tmpDir, "worklogs/eng-1"),
    });
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
    await rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await testDb.db.delete(knowledgeFacts);
    await testDb.db.delete(knowledgeEntities);
  });

  it("extracts facts from structured work log entries", async () => {
    const [entity] = await testDb.db.insert(knowledgeEntities).values({
      projectId, slug: "api", name: "API", entityType: "area",
    }).returning();

    const worklogContent = [
      "## Session Notes",
      "",
      "### Decisions",
      "- Switched from REST to GraphQL for the search endpoint",
      "- Added rate limiting at 100 req/min",
      "",
      "### Status",
      "- Search endpoint is now live in staging",
      "",
      "### Issues",
      "- Memory leak detected in connection pooling",
    ].join("\n");

    const results = await extractionService.extractFromWorklogContent(
      worklogContent,
      entity.id,
      "eng-1",
    );

    expect(results.length).toBeGreaterThanOrEqual(1);

    // Verify facts were written to DB
    const facts = await testDb.db
      .select()
      .from(knowledgeFacts)
      .where(eq(knowledgeFacts.entityId, entity.id));
    expect(facts.length).toBe(results.length);
    expect(facts.every(f => f.sourceAgent === "eng-1")).toBe(true);
  });

  it("handles empty work log gracefully", async () => {
    const [entity] = await testDb.db.insert(knowledgeEntities).values({
      projectId, slug: "empty", name: "Empty", entityType: "area",
    }).returning();

    const results = await extractionService.extractFromWorklogContent("", entity.id, "eng-1");
    expect(results).toHaveLength(0);
  });

  it("handles work log with no extractable sections", async () => {
    const [entity] = await testDb.db.insert(knowledgeEntities).values({
      projectId, slug: "plain", name: "Plain", entityType: "area",
    }).returning();

    const results = await extractionService.extractFromWorklogContent(
      "Just some notes about my day.",
      entity.id,
      "eng-1",
    );
    expect(results).toHaveLength(0);
  });
});
