import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { projects, agents, tasks, comments } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { buildServer } from "../server.js";
import type { FastifyInstance } from "fastify";

describe("Verification Routes", () => {
  let testDb: TestDb;
  let app: FastifyInstance;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    app = buildServer({ databaseUrl: testDb.connectionUri });
    await app.ready();

    const [project] = await testDb.db.insert(projects).values({
      name: "Route Test",
      slug: "route-test",
      homeDir: "/tmp/route-test",
      worktreeDir: "/tmp/route-wt",
      verificationRequired: true,
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values([
      { id: "verifier-1", projectId, name: "Verifier", role: "verifier" },
      { id: "eng-1", projectId, name: "Engineer", role: "engineer" },
      { id: "referee-1", projectId, name: "Referee", role: "referee" },
    ]);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(comments);
    await testDb.db.delete(tasks);
  });

  it("POST /api/tasks/:id/verify — submits verifier verdict", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Verify me",
      column: "verification",
    }).returning();

    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/${task.id}/verify`,
      headers: {
        "x-agent-id": "verifier-1",
        "x-project-id": projectId,
      },
      payload: {
        result: "pass",
        report: "All good.",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.action).toBe("done");
  });

  it("POST /api/tasks/:id/verify — rejects invalid result enum", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Bad verdict",
      column: "verification",
    }).returning();

    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/${task.id}/verify`,
      headers: {
        "x-agent-id": "verifier-1",
        "x-project-id": projectId,
      },
      payload: {
        result: "invalid_value",
        report: "ok",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("POST /api/tasks/:id/implementer-response — submits implementer response", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Respond to me",
      column: "verification",
      verificationResult: "fail",
      verifierReport: "Bug found.",
      assignee: "eng-1",
    }).returning();

    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/${task.id}/implementer-response`,
      headers: {
        "x-agent-id": "eng-1",
        "x-project-id": projectId,
      },
      payload: {
        agrees: true,
        response: "Will fix.",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().action).toBe("in_progress");
  });

  it("POST /api/tasks/:id/referee-verdict — submits referee verdict", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Referee me",
      column: "verification",
      verificationResult: "fail",
      verifierReport: "Issue.",
    }).returning();

    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/${task.id}/referee-verdict`,
      headers: {
        "x-agent-id": "referee-1",
        "x-project-id": projectId,
      },
      payload: {
        result: "pass",
        report: "Implementer is right.",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().action).toBe("done");
  });

  it("POST /api/tasks/:id/spawn-verifier — triggers verification", async () => {
    const [task] = await testDb.db.insert(tasks).values({
      projectId,
      title: "Spawn test",
      column: "review",
    }).returning();

    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/${task.id}/spawn-verifier`,
      headers: {
        "x-agent-id": "eng-1",
        "x-project-id": projectId,
      },
      payload: {
        verifierAgentId: "verifier-1",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);

    const [updated] = await testDb.db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(updated.column).toBe("verification");
  });

  it("returns 404 for nonexistent task", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/task_nonexistent/verify`,
      headers: {
        "x-agent-id": "verifier-1",
        "x-project-id": projectId,
      },
      payload: {
        result: "pass",
        report: "ok",
      },
    });

    expect(res.statusCode).toBe(404);
  });
});
