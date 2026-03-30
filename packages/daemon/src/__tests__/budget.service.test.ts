import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { projects, agents } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { checkBudget } from "../services/budget.service.js";

describe("checkBudget", () => {
  let testDb: TestDb;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Budget Test",
      slug: "budget-test",
      homeDir: "/tmp/budget-test",
      worktreeDir: "/tmp/budget-wt",
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
