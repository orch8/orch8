import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { projects, agents } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { checkBudget, autoPauseIfExhausted } from "../services/budget.service.js";

describe("checkBudget", () => {
  let testDb: TestDb;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Budget Test",
      slug: "budget-test",
      homeDir: "/tmp/budget-test",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(agents);
    // Reset project budget state
    await testDb.db.update(projects).set({
      budgetPaused: false,
      budgetLimitUsd: null,
      budgetSpentUsd: 0,
    });
  });

  it("allows when no budget limits set", async () => {
    await testDb.db.insert(agents).values({
      id: "eng-1", projectId, name: "Eng", role: "engineer",
    });

    const result = await checkBudget(testDb.db, "eng-1", projectId);
    expect(result.allowed).toBe(true);
  });

  it("blocks when project budget is paused", async () => {
    await testDb.db.update(projects).set({ budgetPaused: true });
    await testDb.db.insert(agents).values({
      id: "eng-1", projectId, name: "Eng", role: "engineer",
    });

    const result = await checkBudget(testDb.db, "eng-1", projectId);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Project budget paused");
  });

  it("blocks when project spend exceeds limit", async () => {
    await testDb.db.update(projects).set({
      budgetLimitUsd: 100,
      budgetSpentUsd: 100,
    });
    await testDb.db.insert(agents).values({
      id: "eng-1", projectId, name: "Eng", role: "engineer",
    });

    const result = await checkBudget(testDb.db, "eng-1", projectId);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Project budget exhausted");
  });

  it("blocks when agent budget is paused", async () => {
    await testDb.db.insert(agents).values({
      id: "eng-1", projectId, name: "Eng", role: "engineer",
      budgetPaused: true,
    });

    const result = await checkBudget(testDb.db, "eng-1", projectId);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Agent budget paused");
  });

  it("blocks when agent spend exceeds limit", async () => {
    await testDb.db.insert(agents).values({
      id: "eng-1", projectId, name: "Eng", role: "engineer",
      budgetLimitUsd: 50, budgetSpentUsd: 50,
    });

    const result = await checkBudget(testDb.db, "eng-1", projectId);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Agent budget exhausted");
  });

  it("project-level block takes precedence over agent-level", async () => {
    await testDb.db.update(projects).set({ budgetPaused: true });
    await testDb.db.insert(agents).values({
      id: "eng-1", projectId, name: "Eng", role: "engineer",
      budgetLimitUsd: 50, budgetSpentUsd: 0,
    });

    const result = await checkBudget(testDb.db, "eng-1", projectId);
    expect(result.reason).toContain("Project");
  });

  it("returns not-found for missing project", async () => {
    const result = await checkBudget(testDb.db, "eng-1", "proj_nonexistent");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Project not found");
  });

  it("returns not-found for missing agent", async () => {
    const result = await checkBudget(testDb.db, "nonexistent", projectId);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Agent not found");
  });
});

describe("autoPauseIfExhausted — threshold", () => {
  let testDb: TestDb;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    const [project] = await testDb.db.insert(projects).values({
      name: "Threshold Test",
      slug: "threshold-test",
      homeDir: "/tmp/threshold-test",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(agents);
    await testDb.db.update(projects).set({
      budgetPaused: false,
      budgetLimitUsd: null,
      budgetSpentUsd: 0,
    });
  });

  it("auto-pauses agent when spend reaches threshold percentage", async () => {
    await testDb.db.insert(agents).values({
      id: "eng-1",
      projectId,
      name: "Eng",
      role: "engineer",
      budgetLimitUsd: 100,
      budgetSpentUsd: 80,
      autoPauseThreshold: 80,
    });

    const result = await autoPauseIfExhausted(testDb.db, "eng-1", projectId);
    expect(result.agentPaused).toBe(true);

    const [agent] = await testDb.db
      .select()
      .from(agents)
      .where(and(eq(agents.id, "eng-1"), eq(agents.projectId, projectId)));
    expect(agent.status).toBe("paused");
    expect(agent.pauseReason).toBe("budget_threshold");
  });

  it("does not pause agent when spend is below threshold", async () => {
    await testDb.db.insert(agents).values({
      id: "eng-2",
      projectId,
      name: "Eng 2",
      role: "engineer",
      budgetLimitUsd: 100,
      budgetSpentUsd: 79,
      autoPauseThreshold: 80,
    });

    const result = await autoPauseIfExhausted(testDb.db, "eng-2", projectId);
    expect(result.agentPaused).toBe(false);
  });

  it("ignores threshold when autoPauseThreshold is null", async () => {
    await testDb.db.insert(agents).values({
      id: "eng-3",
      projectId,
      name: "Eng 3",
      role: "engineer",
      budgetLimitUsd: 100,
      budgetSpentUsd: 99,
      autoPauseThreshold: null,
    });

    // Should only trigger the existing exhaustion check (100 >= 100 is false here, 99 < 100)
    const result = await autoPauseIfExhausted(testDb.db, "eng-3", projectId);
    expect(result.agentPaused).toBe(false);
  });
});
