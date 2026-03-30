import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import { projects, agents } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { autoPauseIfExhausted } from "../services/budget.service.js";

describe("autoPauseIfExhausted", () => {
  let testDb: TestDb;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Auto-Pause Test",
      slug: "auto-pause-test",
      homeDir: "/tmp/auto-pause-test",
      worktreeDir: "/tmp/auto-pause-wt",
      budgetLimitUsd: 100,
      budgetSpentUsd: 0,
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
      budgetLimitUsd: 100,
      budgetSpentUsd: 0,
    });
  });

  it("pauses agent when agent spend reaches agent limit", async () => {
    await testDb.db.insert(agents).values({
      id: "eng-1",
      projectId,
      name: "Eng",
      role: "engineer",
      budgetLimitUsd: 50,
      budgetSpentUsd: 50,
    });

    const result = await autoPauseIfExhausted(testDb.db, "eng-1", projectId);

    expect(result.agentPaused).toBe(true);
    expect(result.projectPaused).toBe(false);

    const [agent] = await testDb.db
      .select()
      .from(agents)
      .where(and(eq(agents.id, "eng-1"), eq(agents.projectId, projectId)));
    expect(agent.budgetPaused).toBe(true);
    expect(agent.pauseReason).toBe("budget");
    expect(agent.status).toBe("paused");
  });

  it("pauses project when project spend reaches project limit", async () => {
    await testDb.db.update(projects).set({
      budgetSpentUsd: 100,
    });
    await testDb.db.insert(agents).values({
      id: "eng-1",
      projectId,
      name: "Eng",
      role: "engineer",
    });

    const result = await autoPauseIfExhausted(testDb.db, "eng-1", projectId);

    expect(result.projectPaused).toBe(true);

    const [project] = await testDb.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    expect(project.budgetPaused).toBe(true);
  });

  it("does nothing when under budget", async () => {
    await testDb.db.insert(agents).values({
      id: "eng-1",
      projectId,
      name: "Eng",
      role: "engineer",
      budgetLimitUsd: 50,
      budgetSpentUsd: 10,
    });

    const result = await autoPauseIfExhausted(testDb.db, "eng-1", projectId);

    expect(result.agentPaused).toBe(false);
    expect(result.projectPaused).toBe(false);
  });

  it("does nothing when no limits are set", async () => {
    await testDb.db.update(projects).set({ budgetLimitUsd: null });
    await testDb.db.insert(agents).values({
      id: "eng-1",
      projectId,
      name: "Eng",
      role: "engineer",
      budgetSpentUsd: 999,
    });

    const result = await autoPauseIfExhausted(testDb.db, "eng-1", projectId);

    expect(result.agentPaused).toBe(false);
    expect(result.projectPaused).toBe(false);
  });

  it("does not re-pause already paused agent", async () => {
    await testDb.db.insert(agents).values({
      id: "eng-1",
      projectId,
      name: "Eng",
      role: "engineer",
      budgetLimitUsd: 50,
      budgetSpentUsd: 50,
      budgetPaused: true,
      pauseReason: "budget",
      status: "paused",
    });

    const result = await autoPauseIfExhausted(testDb.db, "eng-1", projectId);

    // Still reports as paused but didn't need to update
    expect(result.agentPaused).toBe(true);
  });
});
