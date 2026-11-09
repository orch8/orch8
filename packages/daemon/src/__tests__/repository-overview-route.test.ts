import { afterEach, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { projectRoutes } from "../api/routes/projects.js";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "orch8-overview-")); dirs.push(root);
  const other = await mkdtemp(join(tmpdir(), "orch8-overview-other-")); dirs.push(other);
  const app = Fastify();
  const getById = vi.fn(async (id: string) => id === "project-a" ? { id, homeDir: root, repoUrl: "https://github.com/orch8/orch8.git" } : id === "project-b" ? { id, homeDir: other } : null);
  app.decorate("projectService", { resolveProjectId: async (id: string) => {
    if (["project-a", "project-b"].includes(id)) return id;
    throw new Error("Project not found");
  }, getById } as never);
  app.addHook("onRequest", async request => {
    request.isAdmin = false;
    request.agent = { projectId: "project-a" } as typeof request.agent;
    request.projectId = "project-a";
  });
  await app.register(projectRoutes);
  const read = (url = "/api/projects/project-a/repository-overview") => app.inject({ method: "GET", url });
  return { root, other, app, read, getById };
}

it("reads only a root README for the authorized project", async () => {
  const { root, app, read } = await fixture();
  try {
    await writeFile(join(root, "README.md"), "# Project A\nA useful overview.");
    const response = await read();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ filename: "README.md", content: "# Project A\nA useful overview." });
  } finally { await app.close(); }
});

it("shows the authorized checkout's PR destination without exposing unsupported origins", async () => {
  const { root, app, read, getById } = await fixture();
  const url = "/api/projects/project-a/repository-origin";
  try {
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "checkout", "-q", "-b", "main"]);
    expect((await read(url)).json()).toMatchObject({ origin: "", originAvailable: false, branch: "main" });
    execFileSync("git", ["-C", root, "remote", "add", "origin", "https://github.com/orch8/orch8.git"]);
    expect((await read(url)).json()).toMatchObject({ origin: "https://github.com/orch8/orch8.git", originAvailable: true,
      configuredRepository: "https://github.com/orch8/orch8", originMatchesProject: true, pushMatchesProject: true });
    execFileSync("git", ["-C", root, "config", "remote.origin.pushurl", "https://github.com/other/repo.git"]);
    expect((await read(url)).json()).toMatchObject({ originMatchesProject: true, pushMatchesProject: false });
    execFileSync("git", ["-C", root, "config", "--unset", "remote.origin.pushurl"]);
    execFileSync("git", ["-C", root, "remote", "set-url", "origin", "https://secret@example.com/team/repo.git"]);
    expect((await read(url)).json()).toMatchObject({ origin: "", originAvailable: true });
    expect((await read("/api/projects/project-b/repository-origin")).statusCode).toBe(403);
    expect(getById).not.toHaveBeenCalledWith("project-b");
  } finally { await app.close(); }
});

it("connects an existing checkout to GitHub once, without pushing or replacing an origin", async () => {
  const root = await mkdtemp(join(tmpdir(), "orch8-connect-origin-")); dirs.push(root);
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  const app = Fastify();
  const project = { id: "project-a", homeDir: root, repoUrl: null as string | null };
  const update = vi.fn(async (_id: string, changes: { repoUrl: string }) => { project.repoUrl = changes.repoUrl; return project; });
  app.decorate("projectService", { resolveProjectId: async () => project.id, getById: async () => project, update } as never);
  let admin = true;
  app.addHook("onRequest", async request => { request.isAdmin = admin; });
  await app.register(projectRoutes);
  const post = (url: string) => app.inject({ method: "POST", url: "/api/projects/project-a/repository-origin", payload: { url } });
  try {
    admin = false;
    expect((await post("https://github.com/orch8/orch8.git")).statusCode).toBe(403);
    admin = true;
    expect((await post("https://user:password@github.com/orch8/orch8.git")).statusCode).toBe(400);
    expect((await post("https://github.com/orch8/orch8.git")).statusCode).toBe(201);
    expect(project.repoUrl).toBe("https://github.com/orch8/orch8.git");
    expect(execFileSync("git", ["-C", root, "remote", "get-url", "origin"], { encoding: "utf8" }).trim()).toBe(project.repoUrl);
    expect((await post("https://github.com/other/repo.git")).statusCode).toBe(409);
    expect(update).toHaveBeenCalledTimes(1);
  } finally { await app.close(); }
});

it("preserves pre-existing origin tracking refs when project update fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "orch8-connect-origin-rollback-")); dirs.push(root);
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  execFileSync("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "--allow-empty", "-m", "seed"]);
  execFileSync("git", ["-C", root, "update-ref", "refs/remotes/origin/old", "HEAD"], { stdio: "ignore" });
  const app = Fastify();
  app.decorate("projectService", { resolveProjectId: async () => "project-a", getById: async () => ({ id: "project-a", homeDir: root, repoUrl: null }), update: async () => { throw new Error("database unavailable"); } } as never);
  app.addHook("onRequest", async request => { request.isAdmin = true; });
  await app.register(projectRoutes);
  try {
    const result = await app.inject({ method: "POST", url: "/api/projects/project-a/repository-origin", payload: { url: "https://github.com/orch8/orch8.git" } });
    expect(result.statusCode).toBe(422);
    expect(execFileSync("git", ["-C", root, "for-each-ref", "--format=%(refname)", "refs/remotes/origin"], { encoding: "utf8" })).toContain("refs/remotes/origin/old");
    expect(execFileSync("git", ["-C", root, "remote"], { encoding: "utf8" }).trim()).toBe("");
  } finally { await app.close(); }
});

it("returns no README for a missing file, symlink, or oversized file", async () => {
  const { root, other, app, read } = await fixture();
  try {
    expect((await read()).json()).toEqual({ filename: null, content: null });
    await writeFile(join(other, "secret.md"), "private");
    await symlink(join(other, "secret.md"), join(root, "README.md"));
    expect((await read()).json()).toEqual({ filename: null, content: null });
    await rm(join(root, "README.md"));
    await writeFile(join(root, "README.md"), "x".repeat(65537));
    expect((await read()).json()).toEqual({ filename: null, content: null });
  } finally { await app.close(); }
});

it("rejects cross-project and arbitrary-path requests before reading another project", async () => {
  const { root, app, read, getById } = await fixture();
  try {
    await writeFile(join(root, "README.md"), "safe");
    expect((await read("/api/projects/project-b/repository-overview")).statusCode).toBe(403);
    expect(getById).not.toHaveBeenCalledWith("project-b");
    expect((await read("/api/projects/missing/repository-overview")).statusCode).toBe(404);
    expect((await read("/api/projects/project-a/repository-overview?path=../secret.md")).statusCode).toBe(400);
  } finally { await app.close(); }
});

it("lists tracked files and previews text without exposing untracked files or symlinks", async () => {
  const { root, other, app, read } = await fixture();
  try {
    execFileSync("git", ["init", "-q", root]);
    await writeFile(join(root, "feature.ts"), "export const working = true;\n");
    await writeFile(join(root, "untracked-secret.txt"), "never show this");
    await writeFile(join(other, "outside.txt"), "private");
    await symlink(join(other, "outside.txt"), join(root, "outside-link"));
    execFileSync("git", ["-C", root, "add", "feature.ts", "outside-link"]);
    const base = "/api/projects/project-a/repository-files";
    expect((await read(base)).json()).toEqual({ paths: ["feature.ts", "outside-link"], truncated: false });
    expect((await read(`${base}?q=feature`)).json()).toEqual({ paths: ["feature.ts"], truncated: false });
    expect((await read(`${base}?q=secret`)).json()).toEqual({ paths: [], truncated: false });
    expect((await read(`${base}?path=feature.ts`)).json()).toEqual({ path: "feature.ts", content: "export const working = true;\n" });
    expect((await read(`${base}?path=outside-link`)).json()).toEqual({ path: "outside-link", content: null });
    expect((await read(`${base}?path=untracked-secret.txt`)).statusCode).toBe(404);
    expect((await read(`${base}?path=../outside.txt`)).statusCode).toBe(400);
    expect((await read("/api/projects/project-b/repository-files")).statusCode).toBe(403);
  } finally { await app.close(); }
});
