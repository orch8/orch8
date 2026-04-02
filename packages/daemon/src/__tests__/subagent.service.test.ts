import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { projects, tasks, heartbeatRuns } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { SubagentService } from "../services/subagent.service.js";

describe("SubagentService", () => {
  let testDb: TestDb;
  let service: SubagentService;
  let projectId: string;
  let parentRunId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    service = new SubagentService(testDb.db);

    const [project] = await testDb.db.insert(projects).values({
      name: "Subagent Test",
      slug: "subagent-test",
      homeDir: "/tmp/sub",
      worktreeDir: "/tmp/sub-wt",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(heartbeatRuns);
    await testDb.db.delete(tasks);

    // Create a parent run for each test
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Quick task",
      taskType: "quick",
    }).returning();

    const [run] = await testDb.db.insert(heartbeatRuns).values({
      agentId: "implementer",
      projectId,
      taskId: task.id,
      invocationSource: "assignment",
      status: "running",
    }).returning();
    parentRunId = run.id;
  });

  describe("registerChild", () => {
    it("creates a child run linked to parent", async () => {
      const child = await service.registerChild(parentRunId, {
        agentId: "frontend-impl",
        projectId,
        scope: "frontend",
      });

      expect(child.id).toMatch(/^run_/);
      expect(child.parentRunId).toBe(parentRunId);
      expect(child.agentId).toBe("frontend-impl");
      expect(child.status).toBe("queued");
      expect(child.triggerDetail).toBe("subagent:frontend");
    });

    it("creates multiple children for parallel work", async () => {
      await service.registerChild(parentRunId, {
        agentId: "fe-impl",
        projectId,
        scope: "frontend",
      });
      await service.registerChild(parentRunId, {
        agentId: "be-impl",
        projectId,
        scope: "backend",
      });

      const children = await service.listChildren(parentRunId);
      expect(children).toHaveLength(2);
    });
  });

  describe("listChildren", () => {
    it("returns only children of the specified parent", async () => {
      await service.registerChild(parentRunId, {
        agentId: "child-a",
        projectId,
        scope: "a",
      });

      // Create an unrelated run
      await testDb.db.insert(heartbeatRuns).values({
        agentId: "other",
        projectId,
        invocationSource: "timer",
      });

      const children = await service.listChildren(parentRunId);
      expect(children).toHaveLength(1);
      expect(children[0].agentId).toBe("child-a");
    });
  });

  describe("completeChild", () => {
    it("marks child as succeeded", async () => {
      const child = await service.registerChild(parentRunId, {
        agentId: "child",
        projectId,
        scope: "test",
      });

      await service.completeChild(child.id, {
        status: "succeeded",
        costUsd: 0.05,
        usageJson: { input_tokens: 1000, output_tokens: 500 },
      });

      const [updated] = await testDb.db
        .select()
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.id, child.id));

      expect(updated.status).toBe("succeeded");
      expect(updated.costUsd).toBe(0.05);
      expect(updated.finishedAt).not.toBeNull();
    });

    it("marks child as failed with error", async () => {
      const child = await service.registerChild(parentRunId, {
        agentId: "child",
        projectId,
        scope: "test",
      });

      await service.completeChild(child.id, {
        status: "failed",
        error: "Process crashed",
      });

      const [updated] = await testDb.db
        .select()
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.id, child.id));

      expect(updated.status).toBe("failed");
      expect(updated.error).toBe("Process crashed");
    });
  });
});
