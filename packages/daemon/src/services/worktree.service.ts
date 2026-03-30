import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ExecFn = (
  command: string,
  args: string[],
  opts: { cwd: string },
) => Promise<{ stdout: string; stderr: string }>;

const defaultExec: ExecFn = (command, args, opts) =>
  execFileAsync(command, args, opts);

export class WorktreeService {
  constructor(private execFn: ExecFn = defaultExec) {}

  async create(opts: {
    homeDir: string;
    worktreeDir: string;
    taskId: string;
    slug: string;
    defaultBranch: string;
  }): Promise<string> {
    const safeSlug = WorktreeService.slugify(opts.slug);
    const worktreePath = `${opts.worktreeDir}/task-${opts.taskId}`;
    const branchName = `task/${opts.taskId}/${safeSlug}`;

    await this.execFn(
      "git",
      ["worktree", "add", worktreePath, "-b", branchName, opts.defaultBranch],
      { cwd: opts.homeDir },
    );

    return worktreePath;
  }

  async remove(opts: {
    homeDir: string;
    worktreeDir: string;
    taskId: string;
    slug: string;
  }): Promise<void> {
    const safeSlug = WorktreeService.slugify(opts.slug);
    const worktreePath = `${opts.worktreeDir}/task-${opts.taskId}`;
    const branchName = `task/${opts.taskId}/${safeSlug}`;

    await this.execFn(
      "git",
      ["worktree", "remove", worktreePath],
      { cwd: opts.homeDir },
    );

    try {
      await this.execFn(
        "git",
        ["branch", "-d", branchName],
        { cwd: opts.homeDir },
      );
    } catch {
      // Branch may already be deleted — not an error
    }
  }

  static slugify(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }
}
