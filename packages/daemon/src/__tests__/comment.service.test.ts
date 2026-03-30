import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { projects, tasks, comments } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { CommentService } from "../services/comment.service.js";

describe("CommentService", () => {
  let testDb: TestDb;
  let service: CommentService;
  let projectId: string;
  let taskId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    service = new CommentService(testDb.db);

    const [project] = await testDb.db.insert(projects).values({
      name: "Comment Test",
      slug: "comment-test",
      homeDir: "/tmp/comment",
      worktreeDir: "/tmp/comment-wt",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(comments);
    await testDb.db.delete(tasks);

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
