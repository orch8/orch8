import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { prepareFeatureBranch, featureBranchReadiness } from "../services/feature-branch.service.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "orch8-branch-prep-")); roots.push(root);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } }).trim();
  git("init", "-q", "-b", "main");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "base");
  return { root, git };
}
describe("feature branch preparation", () => {
  it("creates and checks out only a new named branch from a clean configured default branch", async () => {
    const { root, git } = await fixture();
    expect(await featureBranchReadiness(root, "main")).toMatchObject({ ready: true, branch: "main", baseBranch: "main" });
    expect(await prepareFeatureBranch(root, "main", "feat/my-feature")).toMatchObject({ branch: "feat/my-feature", baseBranch: "main" });
    expect(git("branch", "--show-current")).toBe("feat/my-feature");
    expect(git("rev-parse", "HEAD")).toBe(git("rev-parse", "main"));
    await expect(prepareFeatureBranch(root, "main", "another")).rejects.toThrow(/default branch/);
  });
  it("refuses dirty tracked and untracked work, existing names and invalid names", async () => {
    const { root, git } = await fixture();
    git("branch", "existing");
    await expect(prepareFeatureBranch(root, "main", "existing")).rejects.toThrow(/already exists/);
    for (const name of ["-bad", "x..y", "refs/heads/ok", "bad name", "main"]) {
      await expect(prepareFeatureBranch(root, "main", name)).rejects.toThrow();
    }
    await writeFile(join(root, "new.txt"), "new");
    await expect(prepareFeatureBranch(root, "main", "feat/new")).rejects.toThrow(/clean/);
    await rm(join(root, "new.txt"));
    await writeFile(join(root, ".gitignore"), "ignored\n"); git("add", ".gitignore"); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "ignore");
    await writeFile(join(root, ".gitignore"), "changed");
    await expect(prepareFeatureBranch(root, "main", "feat/new")).rejects.toThrow(/clean/);
    expect(git("branch", "--show-current")).toBe("main");
  });
  it("refuses subdirectories and detached HEAD without switching branches", async () => {
    const { root, git } = await fixture();
    const sub = join(root, "sub"); await import("node:fs/promises").then(fs => fs.mkdir(sub));
    await expect(prepareFeatureBranch(sub, "main", "feat/no")).rejects.toThrow(/root/);
    git("checkout", "--detach", "-q");
    await expect(prepareFeatureBranch(root, "main", "feat/no")).rejects.toThrow(/default branch/);
    expect(git("branch", "--show-current")).toBe("");
  });
});
