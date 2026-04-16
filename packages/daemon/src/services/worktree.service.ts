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

  /**
   * Git refname max length is ~250 bytes once you add the
   * `task/<uuid>/` prefix; terminal filesystems (esp. older ecryptfs)
   * further cap filenames at 255 chars. A 500-char task title
   * therefore overflows both and produces an invalid branch. Cap the
   * slug portion at a safe length (trim a trailing `-` if the cut
   * lands on one).
   */
  static readonly MAX_SLUG_LENGTH = 60;

  static slugify(title: string): string {
    const raw = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (raw.length <= WorktreeService.MAX_SLUG_LENGTH) return raw;
    return raw.slice(0, WorktreeService.MAX_SLUG_LENGTH).replace(/-+$/, "");
  }
}
