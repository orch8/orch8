import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { projects, agents, tasks, pipelines, pipelineSteps, comments, taskDependencies } from "@orch/shared/db";
import type { InjectOptions } from "fastify";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { buildServer } from "../server.js";
import { globalConfigSchema } from "../config/schema.js";
import { hashAgentToken } from "../api/middleware/agent-token.js";

describe("Task route project authorization", () => {
  let fixture: TestDb;
  let app: ReturnType<typeof buildServer>;
  let a: string;
  let b: string;
  let serial = 0;
  const headers = (token = "token-b") => ({ authorization: `Bearer ${token}` });
  const call = (method: InjectOptions["method"], url: string, payload?: object, token = "token-b") =>
    app.inject({ method, url, payload, headers: headers(token) });
  const task = async (projectId = a, extra: Partial<typeof tasks.$inferInsert> = {}) => {
    const [row] = await fixture.db.insert(tasks).values({ id: `fixture-${++serial}`, projectId, title: "Private task", ...extra }).returning();
    return row;
  };
  const snapshot = async () => Promise.all([
    fixture.db.select().from(tasks), fixture.db.select().from(pipelines),
    fixture.db.select().from(pipelineSteps), fixture.db.select().from(comments),
    fixture.db.select().from(taskDependencies), fixture.db.select().from(projects),
  ]);
  beforeAll(async () => {
    fixture = await setupTestDb();
    for (const slug of ["scope-a", "scope-b"]) {
      const [p] = await fixture.db.insert(projects).values({ name: slug, slug, homeDir: "/tmp/orch8-auth-fixture" }).returning();
      if (slug === "scope-a") a = p.id; else b = p.id;
      await fixture.db.insert(agents).values({ id: slug, projectId: p.id, name: slug, role: "engineer",
        agentTokenHash: hashAgentToken(slug === "scope-a" ? "token-a" : "token-b"),
        canCreateTasks: true, canAssignTo: ["*"], canMoveTo: ["backlog", "blocked", "in_progress", "done"],
      });
    }
    app = buildServer({ databaseUrl: fixture.connectionUri, adminToken: "fixture-admin",
      config: globalConfigSchema.parse({ auth: { allow_localhost_admin: false } }),
    });
    // The real auth, routes and DB run; only external execution is intercepted.
    vi.spyOn(app.heartbeatService, "enqueueWakeup").mockResolvedValue({} as Awaited<ReturnType<typeof app.heartbeatService.enqueueWakeup>>);
    await app.ready();
    await app.initPromise;
    // Startup rehydrates tokens; install deterministic fixture credentials afterwards.
    await fixture.db.update(agents).set({ agentTokenHash: hashAgentToken("token-a") }).where(eq(agents.id, "scope-a"));
    await fixture.db.update(agents).set({ agentTokenHash: hashAgentToken("token-b") }).where(eq(agents.id, "scope-b"));
  }, 60_000);
  afterAll(async () => { try { await app?.close(); } finally { if (fixture) await teardownTestDb(fixture); } });
  beforeEach(() => { vi.mocked(app.heartbeatService.enqueueWakeup).mockClear(); });

  it.each([false, true])("foreign project agent cannot complete unassigned pipeline task, successor=%s", async (successor) => {
    const p = await app.pipelineService.create({ projectId: a, name: "Private pipeline", steps: successor ? [{ label: "first" }, { label: "next", agentId: "scope-a" }] : [{ label: "first" }] });
    const before = await snapshot();
    const res = await call("POST", `/api/tasks/${p.firstTask.id}/complete`, { output: "unauthorized" });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "forbidden", message: "Project access denied" });
    expect(await snapshot()).toEqual(before);
    expect(app.heartbeatService.enqueueWakeup).not.toHaveBeenCalled();
  });

  const operations = ["read", "delete", "metadata", "column", "transition", "complete", "dependency-add", "dependency-delete", "convert", "checkout", "release"] as const;
  it.each(operations)("foreign task %s is denied without disclosure or writes", async (op) => {
    const t = await task(a, { taskType: op === "convert" ? "brainstorm" : "quick", column: "in_progress", executionAgentId: "scope-b" });
    const dep = await task(a);
    const before = await snapshot();
    const routes: Record<typeof operations[number], [InjectOptions["method"], string, object?]> = {
      read: ["GET", ""], delete: ["DELETE", ""], metadata: ["PATCH", "", { title: "stolen" }],
      column: ["PATCH", "", { column: "done" }], transition: ["POST", "/transition", { column: "done", agentId: "scope-a", runId: "claimed" }],
      complete: ["POST", "/complete", { output: "stolen" }], "dependency-add": ["POST", "/dependencies", { dependsOnId: dep.id }],
      "dependency-delete": ["DELETE", `/dependencies/${dep.id}`], convert: ["POST", "/convert", { taskType: "quick" }],
      checkout: ["POST", "/checkout"], release: ["POST", "/release"],
    };
    const [method, suffix, payload] = routes[op];
    const res = await app.inject({ method, url: `/api/tasks/${t.id}${suffix}?projectId=${a}`, payload,
      headers: { ...headers(), "x-project-id": a, "x-run-id": "claimed" } });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "forbidden", message: "Project access denied" });
    expect(await snapshot()).toEqual(before);
    expect(app.heartbeatService.enqueueWakeup).not.toHaveBeenCalled();
  });

  it.each(["", "?column=invalid", "?projectId=scope-b", "?column=invalid&projectId=scope-b"])("listing stays token scoped: %s", async (query) => {
    await task(a); await task(b);
    const res = await call("GET", `/api/tasks${query}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBeGreaterThan(0);
    expect(res.json().every((row: { projectId: string }) => row.projectId === b)).toBe(true);
  });
  it.each(["id", "slug", "invalid-filter"])("foreign list filter denied: %s", async (kind) => {
    const res = await call("GET", `/api/tasks?projectId=${kind === "id" ? a : "scope-a"}${kind === "invalid-filter" ? "&column=invalid" : ""}`);
    expect(res.statusCode).toBe(403);
  });
  it.each(["project", "assignee", "dependency", "patch-assignee", "add-dependency", "delete-dependency", "reverse-delete"])("foreign reference denied before allocation or mutation: %s", async (kind) => {
    const foreign = await task(a); const own = await task(b);
    if (kind === "delete-dependency" || kind === "reverse-delete") {
      await fixture.db.insert(taskDependencies).values({
        taskId: kind === "delete-dependency" ? own.id : foreign.id,
        dependsOnId: kind === "delete-dependency" ? foreign.id : own.id,
      });
    }
    const before = await snapshot();
    let res;
    if (kind === "patch-assignee") res = await call("PATCH", `/api/tasks/${own.id}`, { assignee: "scope-a" });
    else if (kind === "add-dependency") res = await call("POST", `/api/tasks/${own.id}/dependencies`, { dependsOnId: foreign.id });
    else if (kind === "delete-dependency") res = await call("DELETE", `/api/tasks/${own.id}/dependencies/${foreign.id}`);
    else if (kind === "reverse-delete") res = await call("DELETE", `/api/tasks/${foreign.id}/dependencies/${own.id}`);
    else res = await call("POST", "/api/tasks", { taskType: "quick", title: "new", projectId: kind === "project" ? a : b,
      ...(kind === "assignee" ? { assignee: "scope-a" } : {}), ...(kind === "dependency" || kind === "project" ? { dependsOn: [foreign.id] } : {}),
    });
    expect(res.statusCode).toBe(403);
    expect(await snapshot()).toEqual(before);
    expect(app.heartbeatService.enqueueWakeup).not.toHaveBeenCalled();
  });

  it.each(["token-a", "fixture-admin"])("same-project/global admin CRUD compatibility: %s", async (token) => {
    const dep = await task(a);
    const created = await call("POST", "/api/tasks", { projectId: a, taskType: "quick", title: "allowed", dependsOn: [dep.id], assignee: "scope-a" }, token);
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    expect((await call("GET", `/api/tasks/${id}`, undefined, token)).statusCode).toBe(200);
    expect((await call("PATCH", `/api/tasks/${id}`, { title: "updated", assignee: "scope-a" }, token)).json().title).toBe("updated");
    expect((await call("DELETE", `/api/tasks/${id}/dependencies/${dep.id}`, undefined, token)).statusCode).toBe(200);
    expect((await call("POST", `/api/tasks/${id}/dependencies`, { dependsOnId: dep.id }, token)).statusCode).toBe(201);
    expect((await call("POST", `/api/tasks/${id}/transition`, { column: "backlog" }, token)).statusCode).toBe(200);
    expect((await call("PATCH", `/api/tasks/${id}`, { column: "blocked" }, token)).statusCode).toBe(200);
    expect((await call("DELETE", `/api/tasks/${id}`, undefined, token)).statusCode).toBe(204);
    const brain = await task(a, { taskType: "brainstorm" });
    expect((await call("POST", `/api/tasks/${brain.id}/convert`, { taskType: "quick" }, token)).json().taskType).toBe("quick");
  });
  it.each(["token-a", "fixture-admin"])("quick and pipeline completion without run identity remains allowed: %s", async (token) => {
    const quick = await task(a, { column: "in_progress" });
    expect((await call("POST", `/api/tasks/${quick.id}/complete`, {}, token)).json().column).toBe("done");
    const p = await app.pipelineService.create({ projectId: a, name: "Allowed", steps: [{ label: "work" }] });
    const res = await call("POST", `/api/tasks/${p.firstTask.id}/complete`, { output: "ok" }, token);
    expect(res.statusCode).toBe(200);
    expect(res.json().completedStep.status).toBe("completed");
    const before = await snapshot();
    expect((await call("POST", `/api/tasks/${p.firstTask.id}/complete`, { output: "stolen" })).statusCode).toBe(403);
    expect(await snapshot()).toEqual(before);
    expect((await call("POST", `/api/tasks/${p.firstTask.id}/complete`, { output: "ok" }, token)).statusCode).toBe(200);
  });
  it("assigned same-project completion retains verification gate", async () => {
    const p = await app.pipelineService.create({ projectId: a, name: "Verify", steps: [{ label: "work", agentId: "scope-a", requiresVerification: true }] });
    const res = await call("POST", `/api/tasks/${p.firstTask.id}/complete`, { output: "ok" }, "token-a");
    expect(res.statusCode).toBe(200);
    expect(res.json().completedStep.status).toBe("awaiting_verification");
  });
  it("checkout/release keep owner and agent-only rules", async () => {
    const t = await task(b);
    expect((await call("POST", `/api/tasks/${t.id}/checkout`)).statusCode).toBe(200);
    await fixture.db.insert(agents).values({ id: "other-b", projectId: b, name: "Other", role: "engineer", agentTokenHash: hashAgentToken("other-b") });
    expect((await call("POST", `/api/tasks/${t.id}/checkout`, undefined, "other-b")).statusCode).toBe(409);
    expect((await call("POST", `/api/tasks/${t.id}/release`, undefined, "other-b")).statusCode).toBe(403);
    expect((await call("POST", `/api/tasks/${t.id}/release`)).statusCode).toBe(200);
    for (const op of ["checkout", "release"]) expect((await call("POST", `/api/tasks/${t.id}/${op}`, undefined, "fixture-admin")).statusCode).toBe(401);
  });
  it("admin selected project is not an authorization restriction", async () => {
    const t = await task(a, { column: "in_progress" });
    for (const [method, suffix, payload] of [["GET", "", undefined], ["PATCH", "", { title: "admin" }], ["POST", "/complete", {}]] as const) {
      expect((await app.inject({ method, url: `/api/tasks/${t.id}${suffix}`, payload, headers: { ...headers("fixture-admin"), "x-project-id": b } })).statusCode).toBe(200);
    }
  });
  it("missing tasks and references return 404; unauthenticated loopback stays 401", async () => {
    expect((await call("GET", "/api/tasks/missing")).statusCode).toBe(404);
    const t = await task(b);
    expect((await call("DELETE", `/api/tasks/${t.id}/dependencies/missing`)).statusCode).toBe(404);
    expect((await call("POST", `/api/tasks/${t.id}/dependencies`, { dependsOnId: "missing" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/tasks/${t.id}` })).statusCode).toBe(401);
    expect((await call("GET", `/api/tasks/${t.id}`, undefined, "invalid")).statusCode).toBe(401);
  });
  it("same-project capability denials remain enforced", async () => {
    await fixture.db.update(agents).set({ canCreateTasks: false, canMoveTo: [], canAssignTo: [] }).where(eq(agents.id, "scope-b"));
    try {
      const t = await task(b);
      expect((await call("POST", "/api/tasks", { projectId: b, taskType: "quick", title: "no" })).statusCode).toBe(403);
      expect((await call("DELETE", `/api/tasks/${t.id}`)).statusCode).toBe(403);
      expect((await call("POST", `/api/tasks/${t.id}/transition`, { column: "blocked" })).statusCode).toBe(403);
      expect((await call("PATCH", `/api/tasks/${t.id}`, { assignee: "scope-b" })).statusCode).toBe(403);
    } finally { await fixture.db.update(agents).set({ canCreateTasks: true, canMoveTo: ["backlog", "blocked", "in_progress", "done"], canAssignTo: ["*"] }).where(eq(agents.id, "scope-b")); }
  });
});
