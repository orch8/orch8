import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { projects, agents, knowledgeEntities, knowledgeFacts, sharedDecisions } from "@orch/shared/db";
import { eq } from "drizzle-orm";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { MemoryService } from "../services/memory.service.js";

describe("Memory Conflict Resolution", () => {
  let testDb: TestDb;
  let memoryService: MemoryService;
  let projectId: string;
  let entityId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    memoryService = new MemoryService(testDb.db);

    const [project] = await testDb.db.insert(projects).values({
      name: "Conflict Test", slug: "conflict-test",
      homeDir: "/tmp/conflict", worktreeDir: "/tmp/conflict-wt",
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values([
      { id: "eng-1", projectId, name: "Engineer 1", role: "engineer" },
      { id: "eng-2", projectId, name: "Engineer 2", role: "engineer" },
    ]);

    const [entity] = await testDb.db.insert(knowledgeEntities).values({
      projectId, slug: "auth", name: "Auth", entityType: "area",
    }).returning();
    entityId = entity.id;
  }, 60_000);

  afterAll(async () => { await teardownTestDb(testDb); });

  beforeEach(async () => {
    await testDb.db.delete(knowledgeFacts);
    await testDb.db.delete(sharedDecisions);
  });

  it("status category: latest timestamp wins — auto-supersedes old fact", async () => {
    const [oldFact] = await testDb.db.insert(knowledgeFacts).values({
      entityId, content: "API is stable", category: "status",
      sourceAgent: "eng-1",
    }).returning();

    const newFact = await memoryService.writeFactWithConflictResolution(
      entityId,
      { content: "API is unstable after deploy", category: "status" },
      "eng-2",
    );

    expect(newFact.content).toBe("API is unstable after deploy");

    // Old fact should be superseded
    const [updated] = await testDb.db
      .select()
      .from(knowledgeFacts)
      .where(eq(knowledgeFacts.id, oldFact.id));
    expect(updated.supersededBy).toBe(newFact.id);
  });

  it("milestone category: append-only — no supersession", async () => {
    await testDb.db.insert(knowledgeFacts).values({
      entityId, content: "v1.0 released", category: "milestone",
      sourceAgent: "eng-1",
    });

    const newFact = await memoryService.writeFactWithConflictResolution(
      entityId,
      { content: "v2.0 released", category: "milestone" },
      "eng-2",
    );

    expect(newFact.content).toBe("v2.0 released");

    // Both facts should exist (no supersession)
    const allFacts = await testDb.db
      .select()
      .from(knowledgeFacts)
      .where(eq(knowledgeFacts.entityId, entityId));
    const activeFacts = allFacts.filter(f => !f.supersededBy);
    expect(activeFacts).toHaveLength(2);
  });

  it("decision category: escalates to shared_decisions table", async () => {
    await testDb.db.insert(knowledgeFacts).values({
      entityId, content: "Use REST", category: "decision",
      sourceAgent: "eng-1",
    });

    const newFact = await memoryService.writeFactWithConflictResolution(
      entityId,
      { content: "Use GraphQL", category: "decision" },
      "eng-2",
    );

    // Both facts kept
    const allFacts = await testDb.db
      .select()
      .from(knowledgeFacts)
      .where(eq(knowledgeFacts.entityId, entityId));
    const activeFacts = allFacts.filter(f => !f.supersededBy);
    expect(activeFacts).toHaveLength(2);

    // Shared decision created for escalation
    const decisions = await testDb.db
      .select()
      .from(sharedDecisions);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].title).toContain("Conflicting decision");
  });

  it("relationship category: latest wins — auto-supersedes old", async () => {
    const [oldFact] = await testDb.db.insert(knowledgeFacts).values({
      entityId, content: "Auth depends on Redis", category: "relationship",
      sourceAgent: "eng-1",
    }).returning();

    const newFact = await memoryService.writeFactWithConflictResolution(
      entityId,
      { content: "Auth depends on Postgres sessions", category: "relationship" },
      "eng-2",
    );

    const [updated] = await testDb.db
      .select()
      .from(knowledgeFacts)
      .where(eq(knowledgeFacts.id, oldFact.id));
    expect(updated.supersededBy).toBe(newFact.id);
  });

  it("issue category: both kept (no supersession)", async () => {
    await testDb.db.insert(knowledgeFacts).values({
      entityId, content: "Memory leak in auth", category: "issue",
      sourceAgent: "eng-1",
    });

    await memoryService.writeFactWithConflictResolution(
      entityId,
      { content: "Timeout in auth refresh", category: "issue" },
      "eng-2",
    );

    const allFacts = await testDb.db
      .select()
      .from(knowledgeFacts)
      .where(eq(knowledgeFacts.entityId, entityId));
    const activeFacts = allFacts.filter(f => !f.supersededBy);
    expect(activeFacts).toHaveLength(2);
  });
});
