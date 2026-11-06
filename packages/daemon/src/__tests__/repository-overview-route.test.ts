import { afterEach, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectRoutes } from "../api/routes/projects.js";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "orch8-overview-")); dirs.push(root);
  const other = await mkdtemp(join(tmpdir(), "orch8-overview-other-")); dirs.push(other);
  const app = Fastify();
  const getById = vi.fn(async (id: string) => id === "project-a" ? { id, homeDir: root } : id === "project-b" ? { id, homeDir: other } : null);
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
