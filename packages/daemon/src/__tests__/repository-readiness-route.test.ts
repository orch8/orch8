import { afterEach, expect, it } from "vitest";
import Fastify from "fastify";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { projectRoutes } from "../api/routes/projects.js";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

it("checks a real checkout without creating a project or modifying its files", async () => {
  const root = await mkdtemp(join(tmpdir(), "orch8-repository-readiness-")); dirs.push(root);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "base");
  const app = Fastify();
  app.addHook("onRequest", async request => { request.isAdmin = true; });
  await app.register(projectRoutes);
  const check = () => app.inject({ method: "POST", url: "/api/projects/repository-readiness", payload: { homeDir: root, defaultBranch: "main" } });
  try {
    git("remote", "add", "origin", "https://github.com/orch8/orch8.git");
    const inspect = () => app.inject({ method: "POST", url: "/api/projects/repository-inspection", payload: { homeDir: root } });
    expect((await inspect()).json()).toMatchObject({ branch: "main", origin: "https://github.com/orch8/orch8.git" });
    git("remote", "set-url", "origin", "https://user:secret@github.com/orch8/orch8.git");
    expect((await inspect()).json()).toMatchObject({ branch: "main", origin: "", originAvailable: true });
    git("remote", "set-url", "origin", "https://github.com/orch8/orch8.git?token=secret");
    expect((await inspect()).json()).toMatchObject({ origin: "", originAvailable: true });
    git("remote", "set-url", "origin", "ssh://git@github.com/orch8/orch8.git");
    expect((await inspect()).json()).toMatchObject({ origin: "ssh://git@github.com/orch8/orch8.git" });
    git("remote", "set-url", "origin", "https://github.com/orch8/orch8.git");
    const good = await check();
    expect(good.statusCode).toBe(200);
    expect(good.json()).toMatchObject({ ready: true, branch: "main" });
    await writeFile(join(root, "untracked.txt"), "do not touch");
    const dirty = await check();
    expect(dirty.json()).toMatchObject({ ready: false, reason: expect.stringContaining("clean") });
    expect(git("status", "--short")).toBe("?? untracked.txt");
    expect((await app.inject({ method: "POST", url: "/api/projects/repository-readiness", payload: { homeDir: "/missing/repository", defaultBranch: "main" } })).json().ready).toBe(false);
    expect((await app.inject({ method: "POST", url: "/api/projects/repository-readiness", payload: { homeDir: root, defaultBranch: "--invalid" } })).json().ready).toBe(false);
  } finally { await app.close(); }
});

it("requires admin access to inspect local repository paths", async () => {
  const app = Fastify();
  app.addHook("onRequest", async request => { request.isAdmin = false; });
  await app.register(projectRoutes);
  try {
    const result = await app.inject({ method: "POST", url: "/api/projects/repository-readiness", payload: { homeDir: "/tmp", defaultBranch: "main" } });
    expect(result.statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/projects/repository-inspection", payload: { homeDir: "/tmp" } })).statusCode).toBe(403);
  } finally { await app.close(); }
});
