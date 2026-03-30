import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { projects, agents, knowledgeEntities, knowledgeFacts } from "@orch/shared/db";
import { eq } from "drizzle-orm";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { MemoryService } from "../services/memory.service.js";

describe("Memory Access Tracking", () => {
  let testDb: TestDb;
  let memoryService: MemoryService;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    memoryService = new MemoryService(testDb.db);

    const [project] = await testDb.db.insert(projects).values({
      name: "Access Test", slug: "access-test",
      homeDir: "/tmp/access", worktreeDir: "/tmp/access-wt",
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values({
      id: "eng-1", projectId, name: "Engineer", role: "engineer",
    });
  }, 60_000);

  afterAll(async () => { await teardownTestDb(testDb); });

  beforeEach(async () => {
    await testDb.db.delete(knowledgeFacts);
    await testDb.db.delete(knowledgeEntities);
  });

  it("increments access_count when facts are listed", async () => {
    const [entity] = await testDb.db.insert(knowledgeEntities).values({
      projectId, slug: "auth", name: "Auth", entityType: "area",
    }).returning();

    const [fact] = await testDb.db.insert(knowledgeFacts).values({
      entityId: entity.id, content: "Uses JWT", category: "decision", sourceAgent: "eng-1",
    }).returning();

    expect(fact.accessCount).toBe(0);

    await memoryService.listFacts(entity.id);

    // Wait briefly for fire-and-forget to complete
    await new Promise(r => setTimeout(r, 50));

    const [updated] = await testDb.db
      .select()
      .from(knowledgeFacts)
      .where(eq(knowledgeFacts.id, fact.id));

    expect(updated.accessCount).toBe(1);
    expect(updated.lastAccessed).not.toBeNull();
  });

  it("increments access_count on each list call", async () => {
    const [entity] = await testDb.db.insert(knowledgeEntities).values({
      projectId, slug: "api", name: "API", entityType: "area",
    }).returning();

    await testDb.db.insert(knowledgeFacts).values({
      entityId: entity.id, content: "REST only", category: "convention", sourceAgent: "eng-1",
    });

    await memoryService.listFacts(entity.id);
    await memoryService.listFacts(entity.id);
    await memoryService.listFacts(entity.id);

    await new Promise(r => setTimeout(r, 50));

    const facts = await testDb.db
      .select()
      .from(knowledgeFacts)
      .where(eq(knowledgeFacts.entityId, entity.id));

    expect(facts[0].accessCount).toBe(3);
  });

  it("trackAccess handles empty array gracefully", async () => {
    await expect(memoryService.trackAccess([])).resolves.toBeUndefined();
  });
});
