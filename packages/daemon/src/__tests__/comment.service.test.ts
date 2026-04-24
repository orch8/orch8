import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { projects, tasks, comments } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { CommentService } from "../services/comment.service.js";

describe("CommentService", () => {
  let testDb: TestDb;
  let service: CommentService;
  let projectId: string;
  let taskId: string;
  let wakeups: Array<{
    agentId: string;
    projectId: string;
    opts: {
      source: "mention" | "assignment";
      taskId?: string;
      commentId?: string;
      reason?: string;
    };
  }>;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Comment Test",
      slug: "comment-test",
      homeDir: "/tmp/comment",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(comments);
    await testDb.db.delete(tasks);
    wakeups = [];
    service = new CommentService(
      testDb.db,
      {
        enqueueWakeup: async (agentId, wakeProjectId, opts) => {
          wakeups.push({ agentId, projectId: wakeProjectId, opts });
          return {};
        },
      },
      {
        commentNew: () => undefined,
      } as never,
    );

    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Commented task",
      taskType: "quick",
    }).returning();
    taskId = task.id;
  });

  describe("create", () => {
    it("creates an inline comment", async () => {
      const comment = await service.create({
        taskId,
        author: "agent-1",
        body: "This function needs refactoring",
        type: "inline",
        lineRef: "src/main.ts:42",
      });

      expect(comment.id).toMatch(/^cmt_/);
      expect(comment.taskId).toBe(taskId);
      expect(comment.author).toBe("agent-1");
      expect(comment.body).toBe("This function needs refactoring");
      expect(comment.type).toBe("inline");
      expect(comment.lineRef).toBe("src/main.ts:42");
      expect(comment.mentions).toEqual([]);
    });

    it("creates a system comment without lineRef", async () => {
      const comment = await service.create({
        taskId,
        author: "daemon",
        body: "Task moved to review",
        type: "system",
      });

      expect(comment.type).toBe("system");
      expect(comment.lineRef).toBeNull();
    });

    it("wakes resolved mentioned agents instead of the assignee", async () => {
      await testDb.db.update(tasks).set({ assignee: "bob" }).where(
        eq(tasks.id, taskId),
      );

      const comment = await service.create({
        taskId,
        author: "user",
        body: "@alice please look",
        mentions: ["alice"],
      });

      expect(comment.mentions).toEqual(["alice"]);
      expect(wakeups).toEqual([
        {
          agentId: "alice",
          projectId,
          opts: expect.objectContaining({
            source: "mention",
            taskId,
            commentId: comment.id,
          }),
        },
      ]);
    });

    it("does not fall through to assignment for self-mentions", async () => {
      await testDb.db.update(tasks).set({ assignee: "bob" }).where(
        eq(tasks.id, taskId),
      );

      await service.create({
        taskId,
        author: "alice",
        body: "@alice",
        mentions: ["alice"],
      });

      expect(wakeups).toEqual([]);
    });

    it("wakes the assignee when there are no resolved mentions", async () => {
      await testDb.db.update(tasks).set({ assignee: "bob" }).where(
        eq(tasks.id, taskId),
      );

      const comment = await service.create({
        taskId,
        author: "user",
        body: "@unknown",
        mentions: [],
      });

      expect(wakeups).toEqual([
        {
          agentId: "bob",
          projectId,
          opts: expect.objectContaining({
            source: "assignment",
            taskId,
            commentId: comment.id,
          }),
        },
      ]);
    });

    it("does not wake anyone when notify is disabled", async () => {
      await testDb.db.update(tasks).set({ assignee: "bob" }).where(
        eq(tasks.id, taskId),
      );

      await service.create({
        taskId,
        author: "user",
        body: "@alice",
        notify: false,
        mentions: ["alice"],
      });

      expect(wakeups).toEqual([]);
    });
  });

  describe("listByTask", () => {
    it("returns all comments for a task ordered by creation time", async () => {
      await service.create({ taskId, author: "a", body: "First" });
      await service.create({ taskId, author: "b", body: "Second" });

      const result = await service.listByTask(taskId);
      expect(result).toHaveLength(2);
      expect(result[0].body).toBe("First");
      expect(result[1].body).toBe("Second");
    });

    it("filters by type", async () => {
      await service.create({ taskId, author: "a", body: "Inline", type: "inline" });
      await service.create({ taskId, author: "b", body: "System", type: "system" });

      const result = await service.listByTask(taskId, { type: "system" });
      expect(result).toHaveLength(1);
      expect(result[0].body).toBe("System");
    });

    it("returns empty array for task with no comments", async () => {
      const result = await service.listByTask(taskId);
      expect(result).toEqual([]);
    });
  });

  describe("delete", () => {
    it("deletes a comment by id", async () => {
      const comment = await service.create({
        taskId,
        author: "a",
        body: "Delete me",
      });

      await service.delete(comment.id);

      const remaining = await service.listByTask(taskId);
      expect(remaining).toHaveLength(0);
    });

    it("throws on nonexistent comment", async () => {
      await expect(
        service.delete("cmt_nonexistent"),
      ).rejects.toThrow("Comment not found");
    });
  });
});
