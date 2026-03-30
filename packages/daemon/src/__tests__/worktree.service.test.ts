import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorktreeService, type ExecFn } from "../services/worktree.service.js";

describe("WorktreeService", () => {
  let execFn: ExecFn;
  let service: WorktreeService;

  beforeEach(() => {
    execFn = vi.fn<ExecFn>().mockResolvedValue({ stdout: "", stderr: "" });
    service = new WorktreeService(execFn);
  });

  describe("create", () => {
    it("runs git worktree add with correct args", async () => {
      const result = await service.create({
        homeDir: "/home/project",
        worktreeDir: "/home/worktrees",
        taskId: "task_abc123",
        slug: "fix-login-bug",
        defaultBranch: "main",
      });

      expect(execFn).toHaveBeenCalledWith(
        "git",
        ["worktree", "add", "/home/worktrees/task-task_abc123", "-b", "task/task_abc123/fix-login-bug", "main"],
        { cwd: "/home/project" },
      );
      expect(result).toBe("/home/worktrees/task-task_abc123");
    });

    it("sanitizes slug for branch name safety", async () => {
      await service.create({
        homeDir: "/home/project",
        worktreeDir: "/home/worktrees",
        taskId: "task_1",
        slug: "Fix  Login  Bug!!!",
        defaultBranch: "main",
      });

      expect(execFn).toHaveBeenCalledWith(
        "git",
        expect.arrayContaining(["-b", "task/task_1/fix-login-bug"]),
        expect.any(Object),
      );
    });

    it("throws on git failure", async () => {
      (execFn as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("fatal: not a git repository"));

      await expect(service.create({
        homeDir: "/bad/path",
        worktreeDir: "/bad/wt",
        taskId: "task_1",
        slug: "test",
        defaultBranch: "main",
      })).rejects.toThrow("fatal: not a git repository");
    });
  });

  describe("remove", () => {
    it("runs git worktree remove and branch delete", async () => {
      await service.remove({
        homeDir: "/home/project",
        worktreeDir: "/home/worktrees",
        taskId: "task_abc123",
        slug: "fix-login-bug",
      });

      expect(execFn).toHaveBeenCalledTimes(2);
      expect(execFn).toHaveBeenCalledWith(
        "git",
        ["worktree", "remove", "/home/worktrees/task-task_abc123"],
        { cwd: "/home/project" },
      );
      expect(execFn).toHaveBeenCalledWith(
        "git",
        ["branch", "-d", "task/task_abc123/fix-login-bug"],
        { cwd: "/home/project" },
      );
    });

    it("does not throw if branch delete fails (already deleted)", async () => {
      let callCount = 0;
      (execFn as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        callCount++;
        if (callCount === 2) throw new Error("error: branch not found");
        return { stdout: "", stderr: "" };
      });

      await expect(service.remove({
        homeDir: "/home/project",
        worktreeDir: "/home/worktrees",
        taskId: "task_1",
        slug: "test",
      })).resolves.toBeUndefined();
    });
  });

  describe("slugify", () => {
    it("converts title to git-safe slug", () => {
      expect(WorktreeService.slugify("Fix Login Bug")).toBe("fix-login-bug");
      expect(WorktreeService.slugify("Add OAuth 2.0 support")).toBe("add-oauth-2-0-support");
      expect(WorktreeService.slugify("  multiple   spaces  ")).toBe("multiple-spaces");
      expect(WorktreeService.slugify("special!@#chars$%^")).toBe("special-chars");
    });
  });
});
