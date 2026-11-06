import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { prepareFeatureBranch, featureBranchReadiness, returnToBaseBranch } from "../services/feature-branch.service.js";

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
  it("returns to the configured local base without deleting the previous branch", async () => {
    const { root, git } = await fixture();
    git("switch", "-q", "-c", "feat/previous");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "feature");
    const previousHead = git("rev-parse", "HEAD");
    expect(await returnToBaseBranch(root, "main")).toEqual({ branch: "main", baseBranch: "main" });
    expect(git("branch", "--show-current")).toBe("main");
    expect(git("rev-parse", "feat/previous")).toBe(previousHead);
  });
  it("does not overwrite ignored runtime data when the base tracks the same path", async () => {
    const { root, git } = await fixture();
    const fs = await import("node:fs/promises");
    await fs.mkdir(join(root, ".orch8"));
    await writeFile(join(root, ".orch8", "run.txt"), "base version");
    git("add", ".orch8/run.txt");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "base runtime path");
    git("switch", "-q", "-c", "feat/previous");
    git("rm", "-q", ".orch8/run.txt");
    await writeFile(join(root, ".gitignore"), ".orch8/\n");
    git("add", ".gitignore");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "ignore runtime");
    await fs.mkdir(join(root, ".orch8"));
    await writeFile(join(root, ".orch8", "run.txt"), "private runtime data");
    await expect(returnToBaseBranch(root, "main")).rejects.toThrow(/Could not switch/);
    expect(git("branch", "--show-current")).toBe("feat/previous");
    expect(await fs.readFile(join(root, ".orch8", "run.txt"), "utf8")).toBe("private runtime data");
  });
  it("refuses tracked, staged, untracked and generated ignore changes", async () => {
    const { root, git } = await fixture();
    git("switch", "-q", "-c", "feat/previous");
    for (const staged of [false, true]) {
      await writeFile(join(root, "file.txt"), "work");
      if (staged) git("add", "file.txt");
      await expect(returnToBaseBranch(root, "main")).rejects.toThrow(/completely clean/);
      git("reset", "-q", "--hard", "HEAD");
      await rm(join(root, "file.txt"), { force: true });
    }
    await writeFile(join(root, ".gitignore"), "# orch8 orchestrator data\n.orch8/\n");
    await expect(returnToBaseBranch(root, "main")).rejects.toThrow(/completely clean/);
    expect(git("branch", "--show-current")).toBe("feat/previous");
  });
  it("refuses a missing target, detached HEAD, subdirectory and invalid base", async () => {
    const { root, git } = await fixture();
    git("switch", "-q", "-c", "feat/previous");
    await expect(returnToBaseBranch(root, "missing")).rejects.toThrow(/not available/);
    await expect(returnToBaseBranch(root, "-evil")).rejects.toThrow(/invalid/);
    const sub = join(root, "sub"); await import("node:fs/promises").then(fs => fs.mkdir(sub));
    await expect(returnToBaseBranch(sub, "main")).rejects.toThrow(/root/);
    git("checkout", "--detach", "-q");
    await expect(returnToBaseBranch(root, "main")).rejects.toThrow(/Check out a branch/);
  });
  it("allows only Orch8's generated ignore change to follow a newly provisioned project onto the feature branch", async () => {
    const { root, git } = await fixture();
    await writeFile(join(root, ".gitignore"), "# orch8 orchestrator data\n.orch8/\n");
    expect(await featureBranchReadiness(root, "main")).toMatchObject({ ready: true });
    await prepareFeatureBranch(root, "main", "feat/generated-ignore");
    expect(git("branch", "--show-current")).toBe("feat/generated-ignore");
    expect(git("status", "--short")).toBe("?? .gitignore");
  });
  it("allows a generated ignore append but rejects other edits to that file", async () => {
    const { root, git } = await fixture();
    await writeFile(join(root, ".gitignore"), "node_modules/\n");
    git("add", ".gitignore");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "base ignore");
    await writeFile(join(root, ".gitignore"), "node_modules/\n# user edits\n");
    await expect(featureBranchReadiness(root, "main")).resolves.toMatchObject({ ready: false });
    await writeFile(join(root, ".gitignore"), "node_modules/\n\n# orch8 orchestrator data\n.orch8/\n");
    expect(await featureBranchReadiness(root, "main")).toMatchObject({ ready: true });
    await prepareFeatureBranch(root, "main", "feat/appended-ignore");
    expect(git("status", "--short")).toBe("M .gitignore");
  });
  it("does not mistake invalid UTF-8 edits for the generated ignore append", async () => {
    const { root, git } = await fixture();
    await writeFile(join(root, ".gitignore"), Buffer.from([0x80, 0x0a]));
    git("add", ".gitignore");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "ignore bytes");
    await writeFile(join(root, ".gitignore"), Buffer.concat([Buffer.from([0x81, 0x0a]), Buffer.from("\n# orch8 orchestrator data\n.orch8/\n")]));
    expect(await featureBranchReadiness(root, "main")).toMatchObject({ ready: false });
  });
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
