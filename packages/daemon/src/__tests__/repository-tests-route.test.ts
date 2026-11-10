import { afterEach, expect, it } from "vitest";
import Fastify from "fastify";
import { mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectRoutes } from "../api/routes/projects.js";
import { runRepositoryTests } from "../services/repository-tests.service.js";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

async function fixture(script?: string) {
  const root = await mkdtemp(join(tmpdir(), "orch8-repo-tests-")); dirs.push(root);
  const other = await mkdtemp(join(tmpdir(), "orch8-repo-tests-other-")); dirs.push(other);
  if (script !== undefined) await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: script } }));
  const app = Fastify();
  const getById = async (id: string) => id === "one" ? { id, homeDir: root } : id === "two" ? { id, homeDir: other } : null;
  app.decorate("projectService", { resolveProjectId: async (id: string) => {
    if (id === "one" || id === "two") return id;
    throw new Error("Project not found");
  }, getById } as never);
  let admin = true;
  let scope = "one";
  app.addHook("onRequest", async request => { request.isAdmin = admin; request.projectId = scope; request.agent = { projectId: scope } as typeof request.agent; });
  await app.register(projectRoutes);
  const url = "/api/projects/one/repository-tests";
  const get = () => app.inject({ method: "GET", url });
  const post = (payload: Record<string, string> = {}) => app.inject({ method: "POST", url, payload });
  return { root, other, app, get, post, setAdmin: (value: boolean) => { admin = value; }, setScope: (value: string) => { scope = value; } };
}

it("shows the exact available root test script without executing it on GET", async () => {
  const f = await fixture("node -e \"console.log('executed')\"");
  try {
    const result = await f.get();
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({ available: true, repository: f.root, script: "node -e \"console.log('executed')\"" });
    expect(result.body).not.toContain("executed\n");
    const run = await f.post();
    expect(run.statusCode).toBe(200);
    expect(run.json()).toMatchObject({ repository: f.root, script: "node -e \"console.log('executed')\"", exitCode: 0, timedOut: false, stdoutTruncated: false, stderrTruncated: false });
    expect(run.json().stdout).toContain("executed");
  } finally { await f.app.close(); }
});

it("returns actual nonzero exit code and separate bounded output", async () => {
  const f = await fixture("node -e \"process.stdout.write('a'.repeat(40000));process.stderr.write('err');process.exit(7)\"");
  try {
    const result = await f.post();
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({ exitCode: 7, timedOut: false, stdoutTruncated: true, stderrTruncated: false, stderr: "err" });
    expect(Buffer.byteLength(result.json().stdout)).toBeLessThanOrEqual(16 * 1024);
  } finally { await f.app.close(); }
});

it("rejects unauthorized, cross-project and nonempty request bodies", async () => {
  const f = await fixture("node -e \"console.log('safe')\"");
  try {
    f.setAdmin(false);
    expect((await f.post()).statusCode).toBe(403);
    f.setScope("two");
    expect((await f.get()).statusCode).toBe(403);
    f.setScope("one"); f.setAdmin(true);
    expect((await f.post({ command: "echo unsafe" })).statusCode).toBe(400);
    expect((await f.post({ script: "build" })).statusCode).toBe(400);
  } finally { await f.app.close(); }
});

it("refuses missing, symlinked and malformed package manifests", async () => {
  const f = await fixture();
  try {
    expect((await f.get()).json()).toMatchObject({ available: false });
    expect((await f.post()).statusCode).toBe(422);
    await writeFile(join(f.other, "package.json"), JSON.stringify({ scripts: { test: "echo unsafe" } }));
    await symlink(join(f.other, "package.json"), join(f.root, "package.json"));
    expect((await f.post()).statusCode).toBe(422);
    await rm(join(f.root, "package.json"));
    await writeFile(join(f.root, "package.json"), "not json");
    expect((await f.post()).statusCode).toBe(422);
  } finally { await f.app.close(); }
});

it("times out a hanging test and reports it separately from an exit code", async () => {
  const f = await fixture("node -e \"setInterval(() => {}, 1000)\"");
  try {
    const result = await runRepositoryTests(f.root, 150);
    expect(result).toMatchObject({ exitCode: null, timedOut: true });
  } finally { await f.app.close(); }
});

it("does not pass daemon secrets or npm pretest hooks to the test script", async () => {
  const f = await fixture("node -e \"console.log(process.env.ORCH8_TEST_SECRET || 'no-secret')\"");
  const previous = process.env.ORCH8_TEST_SECRET;
  process.env.ORCH8_TEST_SECRET = "private-token";
  try {
    await writeFile(join(f.root, "package.json"), JSON.stringify({ scripts: {
      pretest: "node -e \"console.log('pretest-ran')\"",
      test: "node -e \"console.log(process.env.ORCH8_TEST_SECRET || 'no-secret')\"",
    } }));
    const result = (await f.post()).json();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("no-secret");
    expect(result.stdout).not.toContain("private-token");
    expect(result.stdout).not.toContain("pretest-ran");
  } finally {
    if (previous === undefined) delete process.env.ORCH8_TEST_SECRET;
    else process.env.ORCH8_TEST_SECRET = previous;
    await f.app.close();
  }
});
