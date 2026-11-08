import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cloneGitHubRepository, parseGitHubUrl } from "../services/repository-clone.service.js";

let parent: string;
beforeAll(async () => { parent = await mkdtemp(join(tmpdir(), "orch8-clone-test-")); });
afterAll(async () => { await rm(parent, { recursive: true, force: true }); });

describe("GitHub clone boundary", () => {
  it.each([
    "git@github.com:org/repo.git", "http://github.com/org/repo", "https://github.com/org/repo/extra",
    "https://user:password@github.com/org/repo", "https://github.com.evil.example/org/repo",
    "https://github.com/org/../repo", "https://github.com/org/repo?x=1",
    "https://github.com/org/-danger", "https://github.com/org/.git", "https://github.com/org/repo%2Fother",
  ])("rejects unsupported URL %s", url => {
    expect(() => parseGitHubUrl(url)).toThrow(/GitHub HTTPS URL/);
  });

  it("parses a GitHub HTTPS URL into an unambiguous checkout name", () => {
    expect(parseGitHubUrl("https://github.com/org/demo.git")).toEqual({ url: "https://github.com/org/demo.git", folder: "demo" });
  });

  it("never overwrites a preexisting checkout", async () => {
    const target = join(parent, "demo");
    await mkdir(target);
    await writeFile(join(target, "keep.txt"), "keep");
    await expect(cloneGitHubRepository("https://github.com/org/demo.git", parent)).rejects.toThrow(/already exists/);
    expect(await readFile(join(target, "keep.txt"), "utf8")).toBe("keep");
  });

  it("requires an existing absolute parent directory", async () => {
    await expect(cloneGitHubRepository("https://github.com/org/new.git", "relative")).rejects.toThrow(/absolute/);
    await expect(cloneGitHubRepository("https://github.com/org/new.git", join(parent, "missing"))).rejects.toThrow(/does not exist/);
  });
});
