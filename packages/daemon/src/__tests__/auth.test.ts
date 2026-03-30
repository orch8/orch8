import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import { projects, agents } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { authPlugin } from "../api/middleware/auth.js";
import "../types.js";

describe("Auth Middleware", () => {
  let testDb: TestDb;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Auth Test",
      slug: "auth-test",
      homeDir: "/tmp/auth",
      worktreeDir: "/tmp/auth-wt",
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values({
      id: "test-agent",
      projectId,
      name: "Test Agent",
      role: "engineer",
    });
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  function buildApp() {
    const app = Fastify();
    app.decorate("db", testDb.db);
    app.register(authPlugin);
    // Test endpoint that returns auth context
    app.get("/test", async (request) => ({
      isAdmin: request.isAdmin ?? false,
      agentId: request.agent?.id ?? null,
      projectId: request.projectId ?? null,
      runId: request.runId ?? null,
    }));
    return app;
  }

  it("authenticates agent with valid headers", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/test",
      headers: {
        "x-agent-id": "test-agent",
        "x-project-id": projectId,
        "x-run-id": "run_abc123",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.agentId).toBe("test-agent");
    expect(body.projectId).toBe(projectId);
    expect(body.runId).toBe("run_abc123");
    expect(body.isAdmin).toBe(false);

    await app.close();
  });

  it("rejects agent that does not belong to project", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/test",
      headers: {
        "x-agent-id": "nonexistent-agent",
        "x-project-id": projectId,
      },
    });

    expect(response.statusCode).toBe(403);

    await app.close();
  });

  it("grants admin access from localhost without agent headers", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/test",
      headers: {
        "x-project-id": projectId,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.isAdmin).toBe(true);
    expect(body.projectId).toBe(projectId);

    await app.close();
  });
});
