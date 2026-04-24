import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import { agents, errorLog, projects } from "@orch/shared/db";
import { authPlugin } from "../api/middleware/auth.js";
import { hashAgentToken } from "../api/middleware/agent-token.js";
import { errorRoutes } from "../api/routes/errors.js";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import "../types.js";

const ENG_TOKEN = "errors-eng-token";

describe("Error Routes", () => {
  let testDb: TestDb;
  let app: ReturnType<typeof Fastify>;
  let projectId: string;
  let otherProjectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Errors Test",
      slug: "errors-test",
      homeDir: "/tmp/errors",
    }).returning();
    projectId = project.id;

    const [otherProject] = await testDb.db.insert(projects).values({
      name: "Errors Other Test",
      slug: "errors-other-test",
      homeDir: "/tmp/errors-other",
    }).returning();
    otherProjectId = otherProject.id;

    await testDb.db.insert(agents).values({
      id: "eng-1",
      projectId,
      name: "Engineer",
      role: "engineer",
      agentTokenHash: hashAgentToken(ENG_TOKEN),
    });
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(errorLog);

    app = Fastify();
    app.decorate("db", testDb.db);
    app.register(authPlugin, { allowLocalhostAdmin: true });
    app.register(errorRoutes);
    await app.ready();
  });

  async function seedErrors() {
    const [first, second, third] = await testDb.db.insert(errorLog).values([
      {
        projectId,
        agentId: "eng-1",
        severity: "error",
        source: "heartbeat",
        code: "heartbeat.preflight_failed",
        message: "Preflight failed",
        fingerprint: "fp-preflight",
      },
      {
        projectId,
        severity: "warn",
        source: "api",
        code: "api.invalid_filter",
        message: "Invalid filter",
        fingerprint: "fp-filter",
        resolvedAt: new Date(),
        resolvedBy: "admin",
      },
      {
        projectId: otherProjectId,
        severity: "fatal",
        source: "db",
        code: "db.connection_lost",
        message: "Connection lost",
        fingerprint: "fp-db",
      },
    ]).returning();

    return { first, second, third };
  }

  it("lists errors filtered by project and unresolved state", async () => {
    await seedErrors();

    const res = await app.inject({
      method: "GET",
      url: `/api/errors?projectId=${projectId}&unresolvedOnly=true`,
      headers: { "x-project-id": projectId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].code).toBe("heartbeat.preflight_failed");
  });

  it("scopes agent requests to the authenticated project", async () => {
    await seedErrors();

    const res = await app.inject({
      method: "GET",
      url: `/api/errors?projectId=${otherProjectId}`,
      headers: { authorization: `Bearer ${ENG_TOKEN}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(2);
    expect(body.every((row: { projectId: string }) => row.projectId === projectId)).toBe(true);
  });

  it("returns a single error by id", async () => {
    const { first } = await seedErrors();

    const res = await app.inject({
      method: "GET",
      url: `/api/errors/${first.id}`,
      headers: { "x-project-id": projectId },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(first.id);
  });

  it("resolves an error", async () => {
    const { first } = await seedErrors();

    const res = await app.inject({
      method: "PATCH",
      url: `/api/errors/${first.id}/resolve`,
      headers: { "x-project-id": projectId },
      payload: { resolvedBy: "admin@example.test" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.resolvedBy).toBe("admin@example.test");
    expect(body.resolvedAt).toBeTruthy();
  });

  it("summarizes errors by source and severity", async () => {
    await seedErrors();

    const res = await app.inject({
      method: "GET",
      url: `/api/errors/summary?projectId=${projectId}`,
      headers: { "x-project-id": projectId },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(expect.arrayContaining([
      { source: "heartbeat", severity: "error", count: 1 },
      { source: "api", severity: "warn", count: 1 },
    ]));
  });

  it("records client errors as warn api rows with client-prefixed codes", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/errors/client",
      headers: { authorization: `Bearer ${ENG_TOKEN}` },
      payload: {
        code: "dashboard.render_failed",
        message: "Dashboard render failed",
        metadata: { route: "/errors" },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.projectId).toBe(projectId);
    expect(body.agentId).toBe("eng-1");
    expect(body.severity).toBe("warn");
    expect(body.source).toBe("api");
    expect(body.code).toBe("client_dashboard.render_failed");
  });
});
